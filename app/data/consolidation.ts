import { reactive, watch } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { COMPANY_NAME } from './companySettings'

/**
 * Accounting › Consolidation (prod: jurnal-frontend-app/src/pages/consolidations).
 *
 * Group: PT Central Perk Indonesia (holding, IDR) with two subsidiaries and one
 * affiliate. Trial balances below are per business unit, already translated to
 * the reporting currency (IDR). The consolidated column is always
 * Σ entities − eliminations; `assertReportBalances()` checks that the numbers
 * add up and that every balance sheet balances.
 *
 * Every store is a whole-array snapshot in persist.ts so edits, deletes, new
 * records and run status survive a reload (resetDb clears them).
 */

// ─── Business units ──────────────────────────────────────────────────────────

export type DataSource = 'jurnal' | 'spreadsheet' | 'erp'
export type UnitType = 'primary' | 'subsidiary' | 'affiliate'
export type UnitStatus = 'active' | 'connected' | 'disconnected'

export interface BusinessUnit {
  id: string
  code: string
  name: string
  dataSource: DataSource
  currency: string
  unitType: UnitType
  parentId: string | null
  status: UnitStatus
  updatedAt: string
  updatedBy: string
  /** Spreadsheet units only — the last uploaded trial balance file. */
  trialBalanceFile?: string
}

export const DATA_SOURCE_LABEL: Record<DataSource, string> = {
  jurnal: 'Mekari Jurnal',
  spreadsheet: 'Spreadsheet',
  erp: 'Mekari ERP',
}
export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  primary: 'Primary',
  subsidiary: 'Subsidiary',
  affiliate: 'Affiliate',
}
export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  active: 'Active',
  connected: 'Connected',
  disconnected: 'Disconnected',
}
export const CONSOL_CURRENCY_OPTIONS = ['IDR', 'SGD', 'USD', 'MYR']

const SEED_UNITS: BusinessUnit[] = [
  { id: 'bu-cpi', code: 'CPI', name: COMPANY_NAME, dataSource: 'erp', currency: 'IDR', unitType: 'primary', parentId: null, status: 'connected', updatedAt: '2026-08-03T09:12:00', updatedBy: 'Rizal Candra' },
  { id: 'bu-cpr', code: 'CPR', name: 'PT Central Perk Roastery', dataSource: 'jurnal', currency: 'IDR', unitType: 'subsidiary', parentId: 'bu-cpi', status: 'connected', updatedAt: '2026-08-03T09:15:00', updatedBy: 'Rizal Candra' },
  { id: 'bu-cps', code: 'CPS', name: 'Central Perk Coffee Singapore Pte. Ltd.', dataSource: 'spreadsheet', currency: 'SGD', unitType: 'subsidiary', parentId: 'bu-cpi', status: 'active', updatedAt: '2026-08-04T14:40:00', updatedBy: 'Dewi Rahayu', trialBalanceFile: 'CPS_trial_balance_Jul_2026.xlsx' },
  // Worst case: long name, no data yet, never consolidated.
  { id: 'bu-cpk', code: 'CPK', name: 'PT Central Perk Kopi Nusantara Distribusi dan Perdagangan Umum', dataSource: 'jurnal', currency: 'IDR', unitType: 'affiliate', parentId: 'bu-cpi', status: 'disconnected', updatedAt: '2026-07-28T16:05:00', updatedBy: 'Rizal Candra' },
]

/** Units included in the seeded consolidations (the three operating companies). */
export const GROUP_UNIT_IDS = ['bu-cpi', 'bu-cpr', 'bu-cps']

// ─── Consolidation chart of accounts ─────────────────────────────────────────

export type ReportSide = 'pl' | 'bs'
export interface ConsolAccount {
  id: string
  code: string
  name: string
  /** prod category id → chart_of_accounts.account_type.{id} */
  categoryId: number
  parentId: string | null
  isSystem?: boolean
}

export const ACCOUNT_TYPES: Record<number, string> = {
  1: 'Accounts Receivable', 2: 'Other Current Assets', 3: 'Cash & Bank', 4: 'Inventory', 5: 'Fixed Assets',
  6: 'Other Assets', 7: 'Depreciation', 8: 'Accounts Payable', 9: 'Credit Card', 10: 'Other Current Liabilities',
  11: 'Long Term Liabilities', 12: 'Equity', 13: 'Income', 14: 'Other Income', 15: 'Cost of Sales',
  16: 'Expenses', 17: 'Other Expense',
}
export const PL_CATEGORIES = [13, 14, 15, 16, 17]
export const sideOf = (categoryId: number): ReportSide => (PL_CATEGORIES.includes(categoryId) ? 'pl' : 'bs')

const SEED_ACCOUNTS: ConsolAccount[] = [
  { id: 'ca-cash', code: '1-10000', name: 'Cash and cash equivalents', categoryId: 3, parentId: null },
  { id: 'ca-ar', code: '1-10100', name: 'Trade receivables', categoryId: 1, parentId: null },
  { id: 'ca-icar', code: '1-10110', name: 'Intercompany receivables', categoryId: 1, parentId: 'ca-ar' },
  { id: 'ca-inv', code: '1-10200', name: 'Inventory', categoryId: 4, parentId: null },
  { id: 'ca-prepaid', code: '1-10400', name: 'Prepaid expenses', categoryId: 2, parentId: null },
  { id: 'ca-fa', code: '1-10700', name: 'Property, plant and equipment', categoryId: 5, parentId: null },
  { id: 'ca-acc', code: '1-10750', name: 'Accumulated depreciation', categoryId: 7, parentId: null },
  { id: 'ca-invest', code: '1-10800', name: 'Investment in subsidiaries', categoryId: 6, parentId: null },
  { id: 'ca-other', code: '1-10900', name: 'Other non-current assets', categoryId: 6, parentId: null },
  { id: 'ca-ap', code: '2-20100', name: 'Trade payables', categoryId: 8, parentId: null },
  { id: 'ca-icap', code: '2-20110', name: 'Intercompany payables', categoryId: 8, parentId: 'ca-ap' },
  { id: 'ca-accr', code: '2-20300', name: 'Accrued expenses', categoryId: 10, parentId: null },
  { id: 'ca-taxp', code: '2-20500', name: 'Taxes payable', categoryId: 10, parentId: null },
  { id: 'ca-loan', code: '2-20400', name: 'Long-term bank loans', categoryId: 11, parentId: null },
  { id: 'ca-cap', code: '3-30000', name: 'Share capital', categoryId: 12, parentId: null },
  { id: 'ca-re', code: '3-30100', name: 'Retained earnings', categoryId: 12, parentId: null },
  { id: 'ca-fctr', code: '3-30300', name: 'Currency Translation Difference (FCTR)', categoryId: 12, parentId: null, isSystem: true },
  { id: 'ca-rev', code: '4-40000', name: 'Revenue', categoryId: 13, parentId: null },
  { id: 'ca-icrev', code: '4-40100', name: 'Intercompany sales', categoryId: 13, parentId: 'ca-rev' },
  { id: 'ca-cos', code: '5-50000', name: 'Cost of sales', categoryId: 15, parentId: null },
  { id: 'ca-iccos', code: '5-50100', name: 'Intercompany purchases', categoryId: 15, parentId: 'ca-cos' },
  { id: 'ca-sell', code: '6-60000', name: 'Selling expenses', categoryId: 16, parentId: null },
  { id: 'ca-ga', code: '6-60100', name: 'General and administrative expenses', categoryId: 16, parentId: null },
  { id: 'ca-ii', code: '7-70000', name: 'Interest income', categoryId: 14, parentId: null },
  { id: 'ca-ie', code: '8-80000', name: 'Interest expense', categoryId: 17, parentId: null },
  { id: 'ca-tax', code: '9-90000', name: 'Income tax expense', categoryId: 17, parentId: null },
  // Worst case: long name, nothing mapped to it.
  { id: 'ca-unused', code: '6-60999', name: 'Other operating expenses — franchise, licensing and brand royalty fees', categoryId: 16, parentId: null },
]

// ─── Trial balances (per unit, closing, translated to IDR) ───────────────────
//
// Positive = natural balance (debit for assets / expenses, credit for
// liabilities / equity / income). Contra accounts (accumulated depreciation)
// are negative. Retained earnings is the opening balance; the period's profit
// is added on top in the balance sheet.

const M = 1_000_000
type Tb = Record<string, number>
export const TRIAL_BALANCES: Record<string, Tb> = {
  'bu-cpi': {
    'ca-cash': 185 * M, 'ca-ar': 3_580 * M, 'ca-icar': 0, 'ca-inv': 0, 'ca-prepaid': 210 * M,
    'ca-fa': 3_600 * M, 'ca-acc': -1_080 * M, 'ca-invest': 2_607.5 * M, 'ca-other': 480 * M - 192 * M + 1_320 * M,
    'ca-ap': 870 * M, 'ca-icap': 450 * M, 'ca-accr': 310 * M, 'ca-taxp': 145 * M, 'ca-loan': 2_400 * M,
    'ca-cap': 5_000 * M, 'ca-re': 1_192 * M, 'ca-fctr': 0,
    'ca-rev': 3_850 * M, 'ca-icrev': 0, 'ca-cos': 1_155 * M, 'ca-iccos': 1_200 * M,
    'ca-sell': 420 * M, 'ca-ga': 610 * M, 'ca-ii': 12.5 * M, 'ca-ie': 38 * M, 'ca-tax': 96 * M,
  },
  'bu-cpr': {
    'ca-cash': 42 * M, 'ca-ar': 865 * M, 'ca-icar': 450 * M, 'ca-inv': 1_140 * M, 'ca-prepaid': 64 * M,
    'ca-fa': 2_750 * M, 'ca-acc': -825 * M, 'ca-invest': 0, 'ca-other': 310 * M + 120 * M - 48 * M,
    'ca-ap': 540 * M, 'ca-icap': 0, 'ca-accr': 118 * M, 'ca-taxp': 72 * M, 'ca-loan': 1_200 * M,
    'ca-cap': 2_000 * M, 'ca-re': 532.8 * M, 'ca-fctr': 0,
    'ca-rev': 980 * M, 'ca-icrev': 1_200 * M, 'ca-cos': 1_310 * M, 'ca-iccos': 0,
    'ca-sell': 95 * M, 'ca-ga': 240 * M, 'ca-ii': 3.2 * M, 'ca-ie': 21 * M, 'ca-tax': 112 * M,
  },
  'bu-cps': {
    'ca-cash': 24.3 * M, 'ca-ar': 498.15 * M, 'ca-icar': 0, 'ca-inv': 85.05 * M, 'ca-prepaid': 18.225 * M,
    'ca-fa': 0, 'ca-acc': 0, 'ca-invest': 0, 'ca-other': 121.5 * M + 145.8 * M - 36.45 * M,
    'ca-ap': 66.825 * M, 'ca-icap': 0, 'ca-accr': 41.31 * M, 'ca-taxp': 0, 'ca-loan': 0,
    'ca-cap': 607.5 * M, 'ca-re': -42.12 * M, 'ca-fctr': 12.96 * M,
    'ca-rev': 729 * M, 'ca-icrev': 0, 'ca-cos': 255.15 * M, 'ca-iccos': 0,
    'ca-sell': 87.48 * M, 'ca-ga': 182.25 * M, 'ca-ii': 0, 'ca-ie': 0, 'ca-tax': 34.02 * M,
  },
}

// ─── Elimination rules ───────────────────────────────────────────────────────

export interface RuleLeg { unitId: string; accountId: string }
export interface EliminationRule {
  id: string
  name: string
  source: RuleLeg
  destinations: RuleLeg[]
  status: 'active' | 'needs_fix'
  updatedAt: string
  updatedBy: string
}

const SEED_RULES: EliminationRule[] = [
  {
    id: 'er-1', name: 'Intercompany coffee bean sales',
    source: { unitId: 'bu-cpr', accountId: 'ca-icrev' },
    destinations: [{ unitId: 'bu-cpi', accountId: 'ca-iccos' }],
    status: 'active', updatedAt: '2026-07-30T10:20:00', updatedBy: 'Rizal Candra',
  },
  {
    id: 'er-2', name: 'Intercompany receivable and payable — roastery',
    source: { unitId: 'bu-cpr', accountId: 'ca-icar' },
    destinations: [{ unitId: 'bu-cpi', accountId: 'ca-icap' }],
    status: 'active', updatedAt: '2026-07-30T10:24:00', updatedBy: 'Rizal Candra',
  },
  {
    id: 'er-3', name: 'Investment in subsidiaries against subsidiary share capital',
    source: { unitId: 'bu-cpi', accountId: 'ca-invest' },
    destinations: [{ unitId: 'bu-cpr', accountId: 'ca-cap' }, { unitId: 'bu-cps', accountId: 'ca-cap' }],
    status: 'active', updatedAt: '2026-07-30T10:31:00', updatedBy: 'Rizal Candra',
  },
  {
    // Worst case: points at an account in the disconnected affiliate.
    id: 'er-4', name: 'Management fee charged to the distribution affiliate',
    source: { unitId: 'bu-cpi', accountId: 'ca-ii' },
    destinations: [{ unitId: 'bu-cpk', accountId: 'ca-ie' }],
    status: 'needs_fix', updatedAt: '2026-07-18T08:02:00', updatedBy: 'Dewi Rahayu',
  },
]

/**
 * Elimination journal for one run: each entry debits/credits accounts by unit.
 * Amounts are what "Load balance" pulls from the trial balance for the rule.
 * Sign convention per line: amount removed from that account's natural balance.
 */
export interface EliminationLine { unitId: string; accountId: string; debit: number; credit: number }
export interface EliminationEntry { ruleId: string | null; name: string; recurring: boolean; lines: EliminationLine[] }

// Seed first (also safe during module init), then user-added accounts.
const findAccount = (id: string): ConsolAccount | undefined =>
  SEED_ACCOUNTS.find((x) => x.id === id) ?? consolAccounts.find((x) => x.id === id)
const isDebitNature = (accountId: string) => {
  const a = findAccount(accountId)
  if (!a) return true
  return [1, 2, 3, 4, 5, 6, 7, 15, 16, 17].includes(a.categoryId)
}

/** "Load balance" for one leg — closing balance of that account in that unit. */
export function legBalance(leg: RuleLeg): number {
  return TRIAL_BALANCES[leg.unitId]?.[leg.accountId] ?? 0
}

/** Build the elimination entry a rule produces (source reversed, destinations reversed). */
export function entryFromRule(rule: EliminationRule): EliminationEntry {
  const lines: EliminationLine[] = []
  const srcAmt = legBalance(rule.source)
  // Remove the source balance: a debit-nature account is credited, a credit-nature one debited.
  lines.push(isDebitNature(rule.source.accountId)
    ? { ...rule.source, debit: 0, credit: srcAmt }
    : { ...rule.source, debit: srcAmt, credit: 0 })
  for (const d of rule.destinations) {
    const amt = legBalance(d)
    lines.push(isDebitNature(d.accountId)
      ? { ...d, debit: 0, credit: amt }
      : { ...d, debit: amt, credit: 0 })
  }
  return { ruleId: rule.id, name: rule.name, recurring: true, lines }
}

export function entryTotals(e: EliminationEntry) {
  const debit = e.lines.reduce((s, l) => s + l.debit, 0)
  const credit = e.lines.reduce((s, l) => s + l.credit, 0)
  return { debit, credit }
}

// ─── Consolidations ──────────────────────────────────────────────────────────

export type ConsolidationStatus = 'completed' | 'draft' | 'in_progress' | 'failed'
export type PeriodType = 'per_bulan' | 'per_3_bulan' | 'per_6_bulan' | 'per_tahun'
export interface UnitRate { unitId: string; closingRate: number; averageRate: number }

export interface Consolidation {
  id: string
  name: string
  periodType: PeriodType
  periodStart: string
  periodEnd: string
  currency: string
  unitIds: string[]
  status: ConsolidationStatus
  isLocked: boolean
  updatedAt: string
  updatedBy: string
  rates: UnitRate[]
  eliminations: EliminationEntry[]
  /** Wizard step index a draft was saved at (Continue resumes there). */
  draftStep?: number
}

export const STATUS_LABEL: Record<ConsolidationStatus, string> = {
  completed: 'Completed',
  draft: 'Draft',
  in_progress: 'In Progress',
  failed: 'Failed',
}
export const STATUS_BADGE: Record<ConsolidationStatus, 'completed' | 'announcement' | 'information' | 'critical'> = {
  completed: 'completed',
  draft: 'announcement',
  in_progress: 'information',
  failed: 'critical',
}

/** Seed SGD rates (Kurs Tengah BI, end of July 2026 / July average). */
export const DEFAULT_RATES: Record<string, { closingRate: number; averageRate: number }> = {
  SGD: { closingRate: 12_150, averageRate: 12_096 },
  USD: { closingRate: 16_240, averageRate: 16_198 },
  MYR: { closingRate: 3_655, averageRate: 3_641 },
}

function seedEliminations(): EliminationEntry[] {
  return SEED_RULES.filter((r) => r.status === 'active').map(entryFromRule)
}

const SEED_CONSOLIDATIONS: Consolidation[] = [
  {
    id: 'con-2026-07', name: 'Central Perk Group — July 2026', periodType: 'per_bulan',
    periodStart: '2026-07-01', periodEnd: '2026-07-31', currency: 'IDR', unitIds: [...GROUP_UNIT_IDS],
    status: 'completed', isLocked: false, updatedAt: '2026-08-05T11:42:00', updatedBy: 'Rizal Candra',
    rates: [{ unitId: 'bu-cps', ...DEFAULT_RATES.SGD! }], eliminations: seedEliminations(),
  },
  {
    id: 'con-2026-q2', name: 'Central Perk Group — Q2 2026', periodType: 'per_3_bulan',
    periodStart: '2026-04-01', periodEnd: '2026-06-30', currency: 'IDR', unitIds: [...GROUP_UNIT_IDS],
    status: 'completed', isLocked: true, updatedAt: '2026-07-09T15:10:00', updatedBy: 'Rizal Candra',
    rates: [{ unitId: 'bu-cps', closingRate: 12_080, averageRate: 12_011 }], eliminations: seedEliminations(),
  },
  {
    id: 'con-2026-08', name: 'Central Perk Group — August 2026', periodType: 'per_bulan',
    periodStart: '2026-08-01', periodEnd: '2026-08-31', currency: 'IDR', unitIds: [...GROUP_UNIT_IDS],
    status: 'draft', isLocked: false, updatedAt: '2026-08-21T17:05:00', updatedBy: 'Dewi Rahayu',
    rates: [{ unitId: 'bu-cps', ...DEFAULT_RATES.SGD! }], eliminations: [], draftStep: 1,
  },
  {
    // Worst case: longest name the drawer allows (50 chars), failed run.
    id: 'con-2026-roastery', name: 'Roastery and Singapore only — reforecast run (v2)', periodType: 'per_bulan',
    periodStart: '2026-06-01', periodEnd: '2026-06-30', currency: 'IDR', unitIds: ['bu-cpr', 'bu-cps'],
    status: 'failed', isLocked: false, updatedAt: '2026-07-02T09:30:00', updatedBy: 'Dewi Rahayu',
    rates: [{ unitId: 'bu-cps', closingRate: 12_080, averageRate: 12_011 }], eliminations: [],
  },
]

// ─── Groups (business unit tab "Group") ──────────────────────────────────────

export interface UnitGroup { id: string; name: string; unitIds: string[]; lastUsed: string | null }
const SEED_GROUPS: UnitGroup[] = [
  { id: 'grp-1', name: 'Central Perk Group', unitIds: [...GROUP_UNIT_IDS], lastUsed: '2026-08-05T11:42:00' },
  { id: 'grp-2', name: 'Indonesia entities', unitIds: ['bu-cpi', 'bu-cpr'], lastUsed: null },
]

// ─── Roles ───────────────────────────────────────────────────────────────────

export type ConsolRole = 'admin' | 'editor' | 'viewer'
export const ROLE_LABEL: Record<ConsolRole, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }
export interface RoleAssignment { id: string; userName: string; email: string; role: ConsolRole; isOwner?: boolean }
const SEED_ROLES: RoleAssignment[] = [
  { id: 'cr-1', userName: 'Rizal Candra', email: 'rizal.candra@centralperk.co.id', role: 'admin', isOwner: true },
  { id: 'cr-2', userName: 'Dewi Rahayu', email: 'dewi.rahayu@centralperk.co.id', role: 'editor' },
  { id: 'cr-3', userName: 'Lestari Putri', email: 'lestari.putri@centralperk.co.id', role: 'viewer' },
]
/** Company users that can be given a consolidation role (from the users directory). */
export const ROLE_USER_POOL = [
  'Rizal Candra', 'Dewi Rahayu', 'Lestari Putri', 'Budi Santoso', 'Sari Indah', 'Hendra Wijaya', 'Ratna Sari', 'Farhan Nugroho',
]
export const emailFor = (name: string) => `${name.toLowerCase().replace(/\s+/g, '.')}@centralperk.co.id`

// ─── Account mapping (unit account → consolidation account) ──────────────────

export interface UnitAccount { unitId: string; code: string; name: string; side: ReportSide; mappedTo: string | null }
/** Per-unit local accounts; most map 1:1 onto the consolidation chart. */
function seedUnitAccounts(): UnitAccount[] {
  const out: UnitAccount[] = []
  const local: Record<string, [string, string, string | null][]> = {
    'bu-cpi': [
      ['1-10001', 'Kas', 'ca-cash'], ['1-10004', 'Bank BCA', 'ca-cash'], ['1-10100', 'Account Receivable', 'ca-ar'],
      ['1-10110', 'Piutang antar perusahaan', 'ca-icar'], ['1-10402', 'Prepaid Expenses', 'ca-prepaid'],
      ['1-10701', 'Fixed Assets - Building', 'ca-fa'], ['1-10751', 'Accumulated Depreciation - Building', 'ca-acc'],
      ['1-10800', 'Investments', 'ca-invest'], ['2-20100', 'Trade Payable', 'ca-ap'], ['2-20110', 'Hutang antar perusahaan', 'ca-icap'],
      ['2-20400', 'Bank Loans', 'ca-loan'], ['3-30000', 'Paid In Capital', 'ca-cap'], ['3-30100', 'Retained Earnings', 'ca-re'],
      ['4-40000', 'Revenues', 'ca-rev'], ['5-50000', 'Cost of Sales', 'ca-cos'], ['5-50110', 'Purchases from Roastery', 'ca-iccos'],
      ['6-60000', 'Selling Expenses', 'ca-sell'], ['6-60100', 'General & Administrative Expenses', 'ca-ga'],
      ['7-70000', 'Interest Income - Bank', 'ca-ii'], ['8-80000', 'Interest Expense', 'ca-ie'], ['9-90000', 'Income Taxes - Current', 'ca-tax'],
    ],
    'bu-cpr': [
      ['1-1100', 'Kas dan Bank', 'ca-cash'], ['1-1200', 'Piutang Usaha', 'ca-ar'], ['1-1210', 'Piutang Pihak Berelasi', 'ca-icar'],
      ['1-1300', 'Persediaan Green Bean', 'ca-inv'], ['1-1500', 'Mesin Roasting', 'ca-fa'], ['1-1510', 'Akumulasi Penyusutan Mesin', 'ca-acc'],
      ['2-2100', 'Hutang Usaha', 'ca-ap'], ['2-2400', 'Pinjaman Bank Jangka Panjang', 'ca-loan'], ['3-3000', 'Modal Disetor', 'ca-cap'],
      ['3-3100', 'Laba Ditahan', 'ca-re'], ['4-4000', 'Penjualan', 'ca-rev'], ['4-4010', 'Penjualan ke Induk', 'ca-icrev'],
      ['5-5000', 'Harga Pokok Penjualan', 'ca-cos'], ['6-6000', 'Beban Penjualan', 'ca-sell'], ['6-6100', 'Beban Umum dan Administrasi', 'ca-ga'],
      ['8-8000', 'Beban Bunga', 'ca-ie'], ['9-9000', 'Beban Pajak Penghasilan', 'ca-tax'],
    ],
    'bu-cps': [
      ['1000', 'Cash at Bank - DBS', 'ca-cash'], ['1100', 'Trade Debtors', 'ca-ar'], ['1200', 'Stock on Hand', 'ca-inv'],
      ['1300', 'Prepayments', 'ca-prepaid'], ['1600', 'Rental Deposits', 'ca-other'], ['2000', 'Trade Creditors', 'ca-ap'],
      ['2100', 'Accruals', 'ca-accr'], ['3000', 'Ordinary Shares', 'ca-cap'], ['3100', 'Accumulated Losses', 'ca-re'],
      ['4000', 'Sales - Cafe', 'ca-rev'], ['5000', 'Cost of Goods Sold', 'ca-cos'], ['6000', 'Marketing', 'ca-sell'],
      ['6100', 'Staff Costs', 'ca-ga'], ['6150', 'GST Penalty', null], ['6200', 'Corporate Tax', 'ca-tax'],
      ['6300', 'Delivery Platform Commission', null],
    ],
  }
  for (const [unitId, rows] of Object.entries(local)) {
    for (const [code, name, mapped] of rows) {
      const target = SEED_ACCOUNTS.find((a) => a.id === mapped)
      const side: ReportSide = target ? sideOf(target.categoryId) : (Number(code[0]) >= 4 ? 'pl' : 'bs')
      out.push({ unitId, code, name, side, mappedTo: mapped })
    }
  }
  return out
}

// ─── Stores (persisted snapshots) ────────────────────────────────────────────

function store<T>(key: string, seed: T[]): T[] {
  const arr = reactive<T[]>((loadSnapshot<T>(key) ?? JSON.parse(JSON.stringify(seed))) as T[]) as T[]
  watch(() => arr, () => saveSnapshot(key, arr), { deep: true })
  return arr
}

export const consolUnits = store<BusinessUnit>('consolidation-units-v1', SEED_UNITS)
export const consolAccounts = store<ConsolAccount>('consolidation-accounts-v1', SEED_ACCOUNTS)
export const eliminationRules = store<EliminationRule>('consolidation-rules-v1', SEED_RULES)
export const consolidations = store<Consolidation>('consolidation-runs-v1', SEED_CONSOLIDATIONS)
export const unitGroups = store<UnitGroup>('consolidation-groups-v1', SEED_GROUPS)
export const roleAssignments = store<RoleAssignment>('consolidation-roles-v1', SEED_ROLES)
export const unitAccounts = store<UnitAccount>('consolidation-unit-accounts-v1', seedUnitAccounts())

let seq = Date.now() % 100000
export const newId = (prefix: string) => `${prefix}-${++seq}`

export const unitName = (id: string) => consolUnits.find((u) => u.id === id)?.name ?? '-'
export const unitCode = (id: string) => consolUnits.find((u) => u.id === id)?.code ?? '-'
export const consolAccountLabel = (id: string) => {
  const a = consolAccounts.find((x) => x.id === id)
  return a ? `${a.code} ${a.name}` : '-'
}

// ─── Period helpers ──────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`
}
export function formatPeriod(c: Pick<Consolidation, 'periodStart' | 'periodEnd'>): string {
  return `${formatDay(c.periodStart)} - ${formatDay(c.periodEnd)}`
}
export const PERIOD_MONTHS: Record<PeriodType, number> = { per_bulan: 1, per_3_bulan: 3, per_6_bulan: 6, per_tahun: 12 }
/** Period for a type starting in `startMonth` (yyyy-mm). */
export function periodRange(type: PeriodType, startMonth: string): { start: string; end: string } {
  const [y, m] = startMonth.split('-').map(Number) as [number, number]
  const endMonthIdx = m - 1 + PERIOD_MONTHS[type] - 1
  const ey = y + Math.floor(endMonthIdx / 12)
  const em = (endMonthIdx % 12) + 1
  const lastDay = new Date(ey, em, 0).getDate()
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${ey}-${String(em).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export type EliminationMode = 'without_elimination' | 'with_elimination' | 'only_elimination'
export interface ReportLine {
  kind: 'section' | 'category' | 'account' | 'total' | 'grand'
  label: string
  code?: string
  /** per unit id, plus 'elim' and 'consolidated' */
  values?: Record<string, number>
  level: number
}

/** Net elimination effect per account, expressed in the account's natural sign. */
export function eliminationByAccount(c: Consolidation, unitIds: string[] = c.unitIds): Record<string, number> {
  const out: Record<string, number> = {}
  // Only whole entries whose every leg sits in the selected units — keeps each entry balanced.
  for (const e of c.eliminations.filter((x) => x.lines.every((l) => unitIds.includes(l.unitId)))) {
    for (const l of e.lines) {
      const natural = isDebitNature(l.accountId) ? l.debit - l.credit : l.credit - l.debit
      // Elimination column is shown as the amount REMOVED (positive = reduces the balance).
      out[l.accountId] = (out[l.accountId] ?? 0) - natural
    }
  }
  return out
}

function valuesFor(c: Consolidation, unitIds: string[], accountIds: string[], sign = 1): Record<string, number> {
  const elim = eliminationByAccount(c, unitIds)
  const v: Record<string, number> = {}
  let sum = 0
  for (const u of unitIds) {
    const x = accountIds.reduce((s, a) => s + (TRIAL_BALANCES[u]?.[a] ?? 0), 0) * sign
    v[u] = x
    sum += x
  }
  const el = accountIds.reduce((s, a) => s + (elim[a] ?? 0), 0) * sign
  v.elim = el
  v.consolidated = sum - el
  return v
}

const PL_ORDER: { label: string; accounts: string[]; sign: 1 | -1 }[] = [
  { label: 'Revenue', accounts: ['ca-rev', 'ca-icrev'], sign: 1 },
  { label: 'Cost of sales', accounts: ['ca-cos', 'ca-iccos'], sign: -1 },
  { label: 'Operating expenses', accounts: ['ca-sell', 'ca-ga', 'ca-unused'], sign: -1 },
  { label: 'Other income', accounts: ['ca-ii'], sign: 1 },
  { label: 'Other expenses', accounts: ['ca-ie', 'ca-tax'], sign: -1 },
]

export function netIncome(c: Consolidation, unitIds: string[]): Record<string, number> {
  const total: Record<string, number> = {}
  for (const g of PL_ORDER) {
    const v = valuesFor(c, unitIds, g.accounts, g.sign)
    for (const k of Object.keys(v)) total[k] = (total[k] ?? 0) + v[k]!
  }
  return total
}

export function profitLossLines(c: Consolidation, unitIds: string[]): ReportLine[] {
  const lines: ReportLine[] = []
  const add = (a: Record<string, number>, b: Record<string, number>) => {
    const out: Record<string, number> = {}
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = (a[k] ?? 0) + (b[k] ?? 0)
    return out
  }
  let gross: Record<string, number> = {}
  let running: Record<string, number> = {}
  PL_ORDER.forEach((g, gi) => {
    lines.push({ kind: 'category', label: g.label, level: 0 })
    let groupTotal: Record<string, number> = {}
    for (const id of g.accounts) {
      const a = consolAccounts.find((x) => x.id === id) ?? findAccount(id)
      if (!a) continue
      const v = valuesFor(c, unitIds, [id], g.sign)
      groupTotal = add(groupTotal, v)
      lines.push({ kind: 'account', label: a.name, code: a.code, values: valuesFor(c, unitIds, [id], 1), level: 1 })
    }
    lines.push({ kind: 'total', label: `Total ${g.label.toLowerCase()}`, values: Object.fromEntries(Object.entries(groupTotal).map(([k, x]) => [k, x * g.sign])), level: 0 })
    running = add(running, groupTotal)
    if (gi === 1) { gross = { ...running }; lines.push({ kind: 'grand', label: 'Gross profit', values: gross, level: 0 }) }
    if (gi === 2) lines.push({ kind: 'grand', label: 'Operating profit', values: { ...running }, level: 0 })
  })
  lines.push({ kind: 'grand', label: 'Net income', values: running, level: 0 })
  return lines
}

const BS_ORDER: { section: string; groups: { label: string; accounts: string[] }[] }[] = [
  { section: 'Assets', groups: [
    { label: 'Current assets', accounts: ['ca-cash', 'ca-ar', 'ca-icar', 'ca-inv', 'ca-prepaid'] },
    { label: 'Fixed assets', accounts: ['ca-fa'] },
    { label: 'Depreciation & amortization', accounts: ['ca-acc'] },
    { label: 'Other assets', accounts: ['ca-invest', 'ca-other'] },
  ] },
  { section: 'Liability & equity', groups: [
    { label: 'Current liabilities', accounts: ['ca-ap', 'ca-icap', 'ca-accr', 'ca-taxp'] },
    { label: 'Long term liabilities', accounts: ['ca-loan'] },
    { label: 'Equity', accounts: ['ca-cap', 'ca-re', 'ca-fctr'] },
  ] },
]

export function balanceSheetLines(c: Consolidation, unitIds: string[]): ReportLine[] {
  const lines: ReportLine[] = []
  const ni = netIncome(c, unitIds)
  for (const s of BS_ORDER) {
    lines.push({ kind: 'section', label: s.section, level: 0 })
    const sectionTotal: Record<string, number> = {}
    for (const g of s.groups) {
      lines.push({ kind: 'category', label: g.label, level: 0 })
      const gt: Record<string, number> = {}
      for (const id of g.accounts) {
        const a = consolAccounts.find((x) => x.id === id) ?? findAccount(id)
        if (!a) continue
        const v = valuesFor(c, unitIds, [id])
        lines.push({ kind: 'account', label: a.name, code: a.code, values: v, level: 1 })
        for (const k of Object.keys(v)) gt[k] = (gt[k] ?? 0) + v[k]!
      }
      if (g.label === 'Equity') {
        lines.push({ kind: 'account', label: 'Current year earnings', values: ni, level: 1 })
        for (const k of Object.keys(ni)) gt[k] = (gt[k] ?? 0) + ni[k]!
      }
      lines.push({ kind: 'total', label: `Total ${g.label.toLowerCase()}`, values: gt, level: 0 })
      for (const k of Object.keys(gt)) sectionTotal[k] = (sectionTotal[k] ?? 0) + gt[k]!
    }
    lines.push({ kind: 'grand', label: `Total ${s.section.toLowerCase()}`, values: sectionTotal, level: 0 })
  }
  return lines
}

/** Trial balance — every consolidation account with its closing balance (natural sign). */
export function trialBalanceLines(c: Consolidation, unitIds: string[]): ReportLine[] {
  const lines: ReportLine[] = []
  for (const side of ['bs', 'pl'] as ReportSide[]) {
    lines.push({ kind: 'category', label: side === 'bs' ? 'Balance Sheet' : 'Profit & Loss', level: 0 })
    for (const a of [...consolAccounts].filter((x) => sideOf(x.categoryId) === side).sort((x, y) => x.code.localeCompare(y.code))) {
      lines.push({ kind: 'account', label: a.name, code: a.code, values: valuesFor(c, unitIds, [a.id]), level: 1 })
    }
  }
  return lines
}

/**
 * Integrity checks: consolidated = Σ entities − elimination on every line,
 * each elimination entry balances, and assets = liabilities + equity for every
 * column. Throws in dev so a bad edit to the seed is caught immediately.
 */
export function assertReportBalances(c: Consolidation, unitIds: string[] = c.unitIds): void {
  const fail = (msg: string) => { throw new Error(`[consolidation] ${c.name}: ${msg}`) }
  for (const e of c.eliminations) {
    const t = entryTotals(e)
    if (Math.abs(t.debit - t.credit) > 0.5) fail(`elimination "${e.name}" debit ${t.debit} ≠ credit ${t.credit}`)
  }
  for (const l of [...profitLossLines(c, unitIds), ...balanceSheetLines(c, unitIds), ...trialBalanceLines(c, unitIds)]) {
    if (!l.values) continue
    const sum = unitIds.reduce((s, u) => s + (l.values![u] ?? 0), 0)
    if (Math.abs(sum - l.values.elim! - l.values.consolidated!) > 0.5) fail(`line "${l.label}" consolidated ≠ Σ entities − eliminations`)
  }
  const bs = balanceSheetLines(c, unitIds).filter((l) => l.kind === 'grand')
  const [assets, le] = [bs[0]!.values!, bs[1]!.values!]
  for (const k of [...unitIds, 'elim', 'consolidated']) {
    if (Math.abs((assets[k] ?? 0) - (le[k] ?? 0)) > 0.5) fail(`balance sheet out of balance for ${k}: ${assets[k]} vs ${le[k]}`)
  }
}

// Check the seed once at module load (all three operating units, full group).
if (import.meta.dev) {
  for (const c of SEED_CONSOLIDATIONS.filter((x) => x.status === 'completed')) {
    assertReportBalances(c)
    for (const u of c.unitIds) assertReportBalances(c, [u])
    assertReportBalances(c, ['bu-cpi', 'bu-cpr'])
  }
}
