/**
 * Payroll to Ledger (Jurnal x Talenta): sample tenant master data.
 *
 * PT Central Perk Indonesia is linked to Talenta company_id 1212. Talenta sends
 * facts (pay items and groups, no totals); Jurnal decides the accounting (PRD LR-1).
 * This file holds only facts and the account/tag lists. Every figure a screen
 * shows is computed by payrollStore.ts from the payloads built here.
 *
 * No employee data on any screen (names, employee_id, user_id): Talenta's payload carries
 * them, Jurnal counts staff by user_id internally and shows counts only.
 */

export const PAYROLL_COMPANY_ID = 1212
export const PAYROLL_COMPANY_NAME = 'PT Central Perk Indonesia'
/** "Today" in the sample (same day as the budget module). */
export const PAYROLL_TODAY = '2026-10-05'

// ── Roles and people (View as; no real sign-in) ──────────────────────────────

/**
 * Two access types (PM decision 2026-10-13). "Owner or LM" posts; "Other user" (anyone else who
 * reaches Payroll) does everything except posting and saves the draft for them.
 */
export type PayrollRole = 'Owner or LM' | 'Other user'
export const PAYROLL_ROLES: PayrollRole[] = ['Owner or LM', 'Other user']
export interface PayrollPerson { role: PayrollRole; person: string; title: string }
export const PAYROLL_PEOPLE: PayrollPerson[] = [
  { role: 'Owner or LM', person: 'Rizal Candra', title: 'Can post' },
  { role: 'Other user', person: 'Andi Pratama', title: 'Saves drafts only' },
]
export function payrollPerson(role: PayrollRole): PayrollPerson {
  return PAYROLL_PEOPLE.find((p) => p.role === role)!
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export type PayrollAccountType = 'expense' | 'cogs' | 'liability' | 'asset' | 'cash'
export type PayableParty = 'Staff' | 'DJP PPh 21' | 'DJP PPh 26' | 'BPJS Kesehatan' | 'BPJS Ketenagakerjaan' | 'Other'
export const PAYABLE_PARTIES: PayableParty[] = ['Staff', 'DJP PPh 21', 'DJP PPh 26', 'BPJS Kesehatan', 'BPJS Ketenagakerjaan', 'Other']
/** Statutory parties: two of them may never share one payable account (TN-10). */
export const STATUTORY_PARTIES: PayableParty[] = ['DJP PPh 21', 'DJP PPh 26', 'BPJS Kesehatan', 'BPJS Ketenagakerjaan']

export interface PayrollAccount {
  code: string
  name: string
  type: PayrollAccountType
  /** Payables carry exactly one party label. */
  party: PayableParty | null
  /** true = the account already exists in the shared chart (chartOfAccounts / DEFAULT_COA) and is reused. */
  reused: boolean
  archived?: boolean
}

/**
 * Payroll accounts. PRD OQ14 suggests 2-20501..2-20505 for the payables, but the
 * repo chart already uses 2-20501 for Tax Payable - PPh 21 and 2-20201 for Salaries
 * Payable, so same-meaning accounts are reused (TS-03: "reuses same-name accounts")
 * and the rest are added under free codes.
 */
export const PAYROLL_ACCOUNTS: PayrollAccount[] = [
  { code: '5-50101', name: 'Direct Labour', type: 'cogs', party: null, reused: false },
  { code: '6-60101', name: 'Salaries', type: 'expense', party: null, reused: true },
  { code: '6-60004', name: 'Sales Salaries', type: 'expense', party: null, reused: false },
  { code: '6-60106', name: 'Medical Expense', type: 'expense', party: null, reused: false },
  { code: '2-20201', name: 'Salaries Payable', type: 'liability', party: 'Staff', reused: true },
  { code: '2-20501', name: 'Tax Payable - PPh 21', type: 'liability', party: 'DJP PPh 21', reused: true },
  { code: '2-20506', name: 'Tax Payable - PPh 26', type: 'liability', party: 'DJP PPh 26', reused: false },
  { code: '2-20507', name: 'Tax Payable - PPh 21 Final', type: 'liability', party: 'DJP PPh 21', reused: false },
  { code: '2-20508', name: 'BPJS Kesehatan Payable', type: 'liability', party: 'BPJS Kesehatan', reused: false },
  { code: '2-20509', name: 'BPJS Ketenagakerjaan Payable', type: 'liability', party: 'BPJS Ketenagakerjaan', reused: false },
  { code: '2-20510', name: 'PPh 21 DTP', type: 'liability', party: null, reused: false },
  { code: '2-20512', name: 'DPLK Payable', type: 'liability', party: 'Other', reused: false },
  { code: '1-10404', name: 'THR Advance', type: 'asset', party: null, reused: false },
  { code: '1-10301', name: 'Employee Receivables', type: 'asset', party: null, reused: true },
  { code: '1-10004', name: 'Bank BCA', type: 'cash', party: null, reused: true },
  { code: '1-10001', name: 'Cash', type: 'cash', party: null, reused: true },
  { code: '1-10006', name: 'Bank Mandiri', type: 'cash', party: null, reused: false },
]

export const ACC = {
  directLabour: '5-50101',
  salaries: '6-60101',
  salesSalaries: '6-60004',
  medical: '6-60106',
  hutangGaji: '2-20201',
  pph21: '2-20501',
  pph26: '2-20506',
  pph21Final: '2-20507',
  bpjsKes: '2-20508',
  bpjsTk: '2-20509',
  dtp: '2-20510',
  dplk: '2-20512',
  thrAdvance: '1-10404',
  loanReceivable: '1-10301',
  bca: '1-10004',
  cash: '1-10001',
  mandiri: '1-10006',
} as const

// ── Groups and tags ──────────────────────────────────────────────────────────

export const ORGANIZATIONS = ['Operations', 'Finance', 'Human Capital', 'Sales'] as const
export const BRANCHES = ['Jakarta HQ', 'Bandung', 'Surabaya'] as const
export const JOB_LEVELS = ['Staff', 'Supervisor', 'Manager', 'Director'] as const
export const EMPLOYMENT_STATUSES = ['Permanent', 'Contract', 'Probation'] as const
export const BUSINESS_UNITS = ['Coffee Retail', 'Corporate', 'B2B Beans'] as const

/** Department and Project values in the sample company's Jurnal (dimensions a group can add). */
export const DEPARTMENTS = ['Operations', 'Finance', 'Human Capital', 'Sales', 'Marketing'] as const
export const PROJECTS = ['Store Expansion 2026', 'ERP Rollout'] as const

/**
 * A Jurnal dimension, by name. The sample company has Organization, Branch, Department and Project;
 * Payroll settings > Groups adds any of them as a column and each group picks a value.
 */
export type TagDimension = string
export interface PayrollTag { dimension: TagDimension; name: string }
export const PAYROLL_TAGS: PayrollTag[] = [
  ...ORGANIZATIONS.map((name) => ({ dimension: 'Organization', name })),
  ...BRANCHES.map((name) => ({ dimension: 'Branch', name })),
  ...DEPARTMENTS.map((name) => ({ dimension: 'Department', name })),
  ...PROJECTS.map((name) => ({ dimension: 'Project', name })),
]

/**
 * Employee fields Talenta sends that staff can be grouped by (GROUP_FIELDS), named as the salarydetail
 * payload names them. `sbu:<key>` reads one key of the employee's sbu list.
 */
export type TalentaField =
  | 'organization_name' | 'branch' | 'cost_center'
  | 'job_position' | 'job_level' | 'employment_status' | `sbu:${string}`
export const SBU_KEY = 'Business Unit'
export const TALENTA_FIELDS: { field: TalentaField; label: string }[] = [
  { field: 'organization_name', label: 'Organization' },
  { field: 'branch', label: 'Branch' },
  { field: 'cost_center', label: 'Cost center' },
  { field: 'job_position', label: 'Job position' },
  { field: 'job_level', label: 'Job level' },
  { field: 'employment_status', label: 'Employment status' },
  { field: `sbu:${SBU_KEY}`, label: 'Business unit' },
]
/**
 * The Talenta fields staff can be grouped by (Payroll settings > Groups), in TALENTA_FIELDS order.
 * Job position and Job level are left out: they describe a person, not a part of the company, so a
 * group can be one person and the ledger would show that person's pay.
 */
export const GROUP_FIELDS: TalentaField[] = TALENTA_FIELDS.map((f) => f.field).filter((f) => f !== 'job_position' && f !== 'job_level')

// ── Talenta payload shape (webhook "Salary Detail", final, 19 Nov 2025) ──────
// No totals: take-home pay is computed by Jurnal (allowances - deductions).
// Amounts are whole rupiah >= 0; Rp0 items are included. Tax figures arrive as
// components (benefits: PPh 21 Benefit, PPh 21 Resign Benefit, PPh 26 Benefit,
// Total PPh 21 DTP Received; deductions: PPH 21 Paid, PPH 21 Payment).
// No run-type field. employee_name is sent; Jurnal drops it at intake.

export type PaySection = 'allowance' | 'deduction' | 'benefit'
export interface TalentaPayItem { name: string; amount: number }
export interface TalentaSbu { key: string; value: string }
export interface TalentaEmployeeInfo {
  user_id: number
  employee_id: string
  employee_name: string
  job_position: string
  job_level: string
  employment_status: string
  organization_name: string
  branch: string
  cost_center: string | null
  sbu: TalentaSbu[]
}
export interface TalentaComponents { allowances: TalentaPayItem[]; deductions: TalentaPayItem[]; benefits: TalentaPayItem[] }
export interface TalentaItem { employee: TalentaEmployeeInfo; components: TalentaComponents }
export interface TalentaPayload {
  company_id: number
  sent_at: string
  period: { start_date: string; end_date: string }
  items: TalentaItem[]
}
/** The tax components the PPh 21 check reads, with the section they arrive in. */
export type TaxField = 'PPh 21 Benefit' | 'PPh 21 Resign Benefit' | 'PPh 26 Benefit' | 'Total PPh 21 DTP Received' | 'PPH 21 Paid' | 'PPH 21 Payment'
export const TAX_COMPONENTS: { name: TaxField; section: PaySection }[] = [
  { name: 'PPh 21 Benefit', section: 'benefit' },
  { name: 'PPh 21 Resign Benefit', section: 'benefit' },
  { name: 'PPh 26 Benefit', section: 'benefit' },
  { name: 'Total PPh 21 DTP Received', section: 'benefit' },
  { name: 'PPH 21 Paid', section: 'deduction' },
  { name: 'PPH 21 Payment', section: 'deduction' },
]
export const TAX_FIELDS: TaxField[] = TAX_COMPONENTS.map((x) => x.name)

// ── Roster (Talenta employee records the sends are built from) ───────────────
// Jurnal never reads this list. It stands in for Talenta's side so a simulated
// salary detail send carries the right staff: who joined, who left and who moved
// group is only visible to Jurnal through the employees in each send.

export interface GroupFields { organization_name: string; branch_name: string; cost_center_name: string }
export interface RosterEmployee extends GroupFields {
  /** Talenta's unique id; employee_id is editable in Talenta and only shown. */
  user_id: number
  employee_id: string
  job_position: string
  job_level: string
  grade: string
  employment_status: string
  business_unit: string
  basic: number
  expat: boolean
  joined: string
  /** Last day paid; the employee is in no send whose period starts after it. */
  left: string | null
  /** Group changes in Talenta, effective from the date given. */
  moves: { effective: string; to: GroupFields }[]
}

function emp(n: number, g: GroupFields, job_position: string, job_level: string, basic: number, extra: Partial<RosterEmployee> = {}): RosterEmployee {
  const bu = g.organization_name === 'Operations' && g.cost_center_name.startsWith('Store') ? 'Coffee Retail'
    : g.organization_name === 'Sales' ? 'B2B Beans' : 'Corporate'
  const grade = job_level === 'Staff' ? 'G2' : job_level === 'Supervisor' ? 'G3' : job_level === 'Manager' ? 'G5' : 'G7'
  return {
    user_id: 51_000 + n, employee_id: `EMP-${String(n).padStart(4, '0')}`, ...g, job_position, job_level, grade,
    employment_status: n % 9 === 0 ? 'Contract' : n % 17 === 0 ? 'Probation' : 'Permanent',
    business_unit: bu, basic, expat: false, joined: '2024-01-02', left: null, moves: [], ...extra,
  }
}

/**
 * 40 staff in every run. Between August and September HR settles three changes in
 * Talenta: EMP-0038 leaves Sales Surabaya after 20 Aug, EMP-0035 moves from Sales
 * Jakarta HQ to Sales Surabaya on 1 Sep and EMP-0041 joins Sales Bandung on 1 Sep.
 * Sales Surabaya keeps 2 staff with one of them different. Jurnal sees these
 * changes only by comparing the September send with the August one.
 */
export function sampleRoster(): RosterEmployee[] {
  const out: RosterEmployee[] = []
  let n = 0
  const G = (o: string, b: string, c: string): GroupFields => ({ organization_name: o, branch_name: b, cost_center_name: c })
  const stores: [string, string, number][] = [['Jakarta HQ', 'Store Jakarta Kemang', 8], ['Bandung', 'Store Bandung Dago', 6], ['Surabaya', 'Store Surabaya Tunjungan', 6]]
  for (const [branch, cc, staff] of stores) {
    out.push(emp(++n, G('Operations', branch, cc), 'Store Supervisor', 'Supervisor', 8_250_000 + n * 61_350))
    for (let i = 0; i < staff; i++) out.push(emp(++n, G('Operations', branch, cc), i % 3 === 2 ? 'Cashier' : 'Barista', 'Staff', 5_300_000 + i * 137_550 + (n % 4) * 45_150))
  }
  out.push(emp(++n, G('Operations', 'Jakarta HQ', 'HQ Operations'), 'Operations Manager', 'Manager', 22_500_000))
  out.push(emp(++n, G('Finance', 'Jakarta HQ', 'HQ Finance'), 'Finance Manager', 'Manager', 24_000_000))
  for (const b of [9_500_000, 11_250_000, 12_500_000]) out.push(emp(++n, G('Finance', 'Jakarta HQ', 'HQ Finance'), 'Accounting Staff', 'Staff', b))
  out.push(emp(++n, G('Human Capital', 'Jakarta HQ', 'HQ Human Capital'), 'Human Capital Manager', 'Manager', 21_000_000))
  for (const b of [8_750_000, 10_250_000]) out.push(emp(++n, G('Human Capital', 'Jakarta HQ', 'HQ Human Capital'), 'Human Capital Staff', 'Staff', b))
  out.push(emp(++n, G('Human Capital', 'Surabaya', 'HQ Human Capital'), 'Human Capital Staff', 'Staff', 8_400_000))
  out.push(emp(++n, G('Sales', 'Jakarta HQ', 'HQ Sales'), 'Sales Manager', 'Manager', 23_500_000))
  for (const b of [10_500_000, 9_750_000]) out.push(emp(++n, G('Sales', 'Jakarta HQ', 'HQ Sales'), 'Account Executive', 'Staff', b))
  // EMP-0035 moves to Sales Surabaya from 1 Sep 2026, in place of EMP-0038.
  out[out.length - 1]!.moves.push({ effective: '2026-09-01', to: G('Sales', 'Surabaya', 'Regional Sales') })
  for (const b of [9_250_000, 9_000_000]) out.push(emp(++n, G('Sales', 'Bandung', 'Regional Sales'), 'Account Executive', 'Staff', b))
  // EMP-0038 leaves on 20 Aug 2026, the last day of the August run.
  out.push(emp(++n, G('Sales', 'Surabaya', 'Regional Sales'), 'Account Executive', 'Staff', 9_100_000, { left: '2026-08-20' }))
  out.push(emp(++n, G('Sales', 'Surabaya', 'Regional Sales'), 'Account Executive', 'Staff', 9_400_000))
  // The expatriate Finance Director: PPh 26.
  const dir = emp(++n, G('Finance', 'Jakarta HQ', 'HQ Finance'), 'Finance Director', 'Director', 95_000_000, { expat: true, employment_status: 'Contract' })
  out.push(dir)
  // Joins Sales Bandung on 1 Sep 2026.
  out.push(emp(++n, G('Sales', 'Bandung', 'Regional Sales'), 'Account Executive', 'Staff', 9_000_000, { joined: '2026-09-01', employment_status: 'Probation' }))
  return out
}

export function groupsAsOf(e: RosterEmployee, date: string): GroupFields {
  let g: GroupFields = { organization_name: e.organization_name, branch_name: e.branch_name, cost_center_name: e.cost_center_name }
  for (const t of [...e.moves].sort((a, b) => a.effective.localeCompare(b.effective))) if (t.effective <= date) g = { ...t.to }
  return g
}

// ── Payroll arithmetic (Talenta's side, for the simulated sends) ─────────────

const KES_CAP = 12_000_000
const JP_CAP = 11_086_300

/** TER category A monthly rates (PP 58/2023), upper bounds in rupiah. */
const TER_A: [number, number][] = [
  [5_400_000, 0], [5_650_000, 0.0025], [5_950_000, 0.005], [6_300_000, 0.0075], [6_750_000, 0.01], [7_500_000, 0.0125],
  [8_550_000, 0.015], [9_650_000, 0.0175], [10_050_000, 0.02], [10_350_000, 0.0225], [10_700_000, 0.025], [11_050_000, 0.03],
  [11_600_000, 0.035], [12_500_000, 0.04], [13_750_000, 0.05], [15_100_000, 0.06], [16_950_000, 0.07], [19_750_000, 0.08],
  [24_150_000, 0.09], [26_450_000, 0.1], [28_000_000, 0.11], [30_050_000, 0.12], [32_400_000, 0.13], [35_400_000, 0.14],
  [39_100_000, 0.15], [43_850_000, 0.16], [47_800_000, 0.17], [51_400_000, 0.18], [56_300_000, 0.19], [62_200_000, 0.2],
  [68_600_000, 0.21], [77_500_000, 0.22], [89_000_000, 0.23], [103_000_000, 0.24], [125_000_000, 0.25],
]
export function terRate(gross: number): number {
  for (const [cap, rate] of TER_A) if (gross <= cap) return rate
  return 0.26
}

function workingDays(start: string, end: string): number {
  let d = new Date(start + 'T00:00:00Z'), n = 0
  const e = new Date(end + 'T00:00:00Z')
  while (d <= e) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; d = new Date(d.getTime() + 86_400_000) }
  return n
}
function monthIndex(date: string): number { return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) }

export interface PayloadOptions {
  sentAt: string
  /** A new allowance Talenta starts sending (unmapped pay item hold). */
  newAllowance?: { name: string; organization?: string; amount: number }
  /** The last `staff` employees of an organization sent under a new branch (a new group). */
  newGroup?: { organization: string; branch: string; staff: number }
  /** Basic Salary raise for one organization (a revision). */
  raise?: { organization: string; amount: number }
  /** Only staff of one branch (a partial re-send). */
  onlyBranch?: string
  /** A THR-only run (separate run). */
  thr?: boolean
  /** Components HR left unticked in Talenta's send checklist (by name, any section). */
  omit?: string[]
  /** PPh 21 Benefit sent lower than the tax deducted (tax rule warning). */
  taxOff?: { employeeId: string; amount: number }[]
  /** Repeat one employee row exactly (duplicate employee warning). */
  duplicateEmployee?: string
  /** Shift PPh 21 between employees with the same total (tax change, no ledger change on PPh 21). */
  taxShift?: { from: string; to: string; amount: number }
}

/** Generic placeholder: Talenta sends employee_name, Jurnal drops it at intake and never shows it. */
export const sampleEmployeeName = (employeeId: string) => `Karyawan ${employeeId.slice(4)}`

/**
 * Build one salary detail body for a period from the roster, in the final payload
 * shape (no totals, whole rupiah, Rp0 items included). Pure: the same roster,
 * period and options always give the same body.
 */
export function buildSalaryDetail(roster: RosterEmployee[], start: string, end: string, o: PayloadOptions): TalentaPayload {
  const mi = monthIndex(end)
  const days = workingDays(start, end)
  const items: TalentaItem[] = []
  const R = Math.round
  const moved = new Set(o.newGroup ? roster.filter((e) => !(e.joined > end || (e.left !== null && e.left < start)) && groupsAsOf(e, end).organization_name === o.newGroup!.organization).slice(-o.newGroup.staff).map((e) => e.employee_id) : [])
  for (const e of roster) {
    if (e.joined > end || (e.left !== null && e.left < start)) continue
    const g0 = groupsAsOf(e, end)
    const g = moved.has(e.employee_id) ? { ...g0, branch_name: o.newGroup!.branch } : g0
    if (o.onlyBranch && g.branch_name !== o.onlyBranch) continue
    const num = Number(e.employee_id.slice(4))
    const basic = e.basic + (o.raise && g.organization_name === o.raise.organization ? o.raise.amount : 0)
    const jabatan = e.job_level === 'Supervisor' ? 1_000_000 : e.job_level === 'Manager' ? 3_500_000 : e.job_level === 'Director' ? 10_000_000 : 0
    const base = basic + jabatan
    const allowances: TalentaPayItem[] = []
    const deductions: TalentaPayItem[] = []
    const benefits: TalentaPayItem[] = []
    const kesCo = R(Math.min(base, KES_CAP) * 0.04)
    const jkk = R(base * 0.0024)
    const jkm = R(base * 0.003)
    let taxable: number
    if (o.thr) {
      allowances.push({ name: 'THR Keagamaan', amount: base })
      taxable = base
    } else {
      allowances.push({ name: 'Basic Salary', amount: basic })
      if (jabatan) allowances.push({ name: 'Tunjangan Jabatan', amount: jabatan })
      if (e.job_level === 'Staff' || e.job_level === 'Supervisor') allowances.push({ name: 'Uang Makan', amount: 25_000 * days })
      if ((num + mi) % 7 === 0) allowances.push({ name: 'Reimbursement Medical', amount: 350_000 + ((num * 13) % 5) * 75_000 })
      if (o.newAllowance && (!o.newAllowance.organization || g.organization_name === o.newAllowance.organization)) allowances.push({ name: o.newAllowance.name, amount: o.newAllowance.amount })
      taxable = allowances.filter((a) => !/reimburs/i.test(a.name)).reduce((s, a) => s + a.amount, 0) + kesCo + jkk + jkm
    }
    const tax = Math.floor(taxable * (e.expat ? 0.2 : terRate(taxable)))
    // PPh 21 DTP: store staff with gross up to Rp10.000.000 (labour-intensive sector).
    const dtp = !o.thr && !e.expat && g.cost_center_name.startsWith('Store') && taxable <= 10_000_000 ? tax : 0
    allowances.push({ name: 'PPh 21 Ditanggung Pemerintah', amount: dtp })
    if (!o.thr) {
      deductions.push({ name: 'JHT Employee', amount: R(base * 0.02) })
      deductions.push({ name: 'JP Employee', amount: R(Math.min(base, JP_CAP) * 0.01) })
      deductions.push({ name: 'BPJSK Employee', amount: R(Math.min(base, KES_CAP) * 0.01) })
    }
    deductions.push({ name: 'PPH 21 Paid', amount: tax })
    deductions.push({ name: 'PPH 21 Payment', amount: 0 })
    if (!o.thr) {
      if (num === 3 || num === 21) deductions.push({ name: 'Loan Instalment', amount: num === 3 ? 500_000 : 750_000 })
      if (num === 10 || num === 27) deductions.push({ name: 'THR Paid', amount: 400_000 })
      // Employer-paid contributions arrive as benefits: they are not in take-home pay.
      benefits.push({ name: 'BPJS K paid by company', amount: kesCo })
      benefits.push({ name: 'JKK paid by company', amount: jkk })
      benefits.push({ name: 'JKM paid by company', amount: jkm })
      benefits.push({ name: 'JHT paid by company', amount: R(base * 0.037) })
      benefits.push({ name: 'JP paid by company', amount: R(Math.min(base, JP_CAP) * 0.02) })
      if (e.job_level === 'Manager' || e.job_level === 'Director') benefits.push({ name: 'DPLK paid by company', amount: R(basic * 0.05) })
    }
    const off = (o.taxOff ?? []).filter((t) => t.employeeId === e.employee_id).reduce((s, t) => s + t.amount, 0)
    benefits.push({ name: 'PPh 21 Benefit', amount: e.expat ? 0 : Math.max(0, tax - off) })
    benefits.push({ name: 'PPh 21 Resign Benefit', amount: 0 })
    benefits.push({ name: 'PPh 26 Benefit', amount: e.expat ? tax : 0 })
    benefits.push({ name: 'Total PPh 21 DTP Received', amount: dtp })
    items.push({
      employee: {
        user_id: e.user_id, employee_id: e.employee_id, employee_name: sampleEmployeeName(e.employee_id),
        job_position: e.job_position, job_level: e.job_level, employment_status: e.employment_status,
        organization_name: g.organization_name, branch: g.branch_name, cost_center: g.cost_center_name || null,
        sbu: [{ key: SBU_KEY, value: e.business_unit }],
      },
      components: { allowances, deductions, benefits },
    })
  }
  if (o.taxShift) {
    const a = items.find((x) => x.employee.employee_id === o.taxShift!.from)
    const b = items.find((x) => x.employee.employee_id === o.taxShift!.to)
    if (a && b) {
      const shift = (row: TalentaItem, d: number) => {
        for (const [list, name] of [[row.components.benefits, 'PPh 21 Benefit'], [row.components.deductions, 'PPH 21 Paid']] as const) {
          const it = list.find((x) => x.name === name)
          if (it) it.amount = Math.max(0, it.amount + d)
        }
      }
      shift(a, -o.taxShift.amount); shift(b, o.taxShift.amount)
    }
  }
  if (o.omit?.length) {
    const drop = new Set(o.omit.map((n) => n.trim().toLowerCase()))
    for (const it of items) for (const k of ['allowances', 'deductions', 'benefits'] as const) it.components[k] = it.components[k].filter((x) => !drop.has(x.name.trim().toLowerCase()))
  }
  if (o.duplicateEmployee) {
    const d = items.find((x) => x.employee.employee_id === o.duplicateEmployee)
    if (d) items.push(JSON.parse(JSON.stringify(d)))
  }
  return { company_id: PAYROLL_COMPANY_ID, sent_at: o.sentAt, period: { start_date: start, end_date: end }, items }
}
