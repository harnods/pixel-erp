/**
 * Advanced Budgeting: master data (departments, projects, budget accounts, people).
 *
 * A budget line is one account plus one mix of department and project (project
 * optional) for one year, split by month (PRD FG-1, LR-1). Department and project
 * are the two active budget dimensions.
 */

export type BudgetClass = 'Opex' | 'Capex'

export interface BudgetDepartment { id: string; name: string; holder: string }
export interface BudgetProject { id: string; name: string; description: string; status: 'Active' | 'Cancelled' }
export interface BudgetAccount {
  code: string
  name: string
  /** Every budget account carries a class before a line can use it (PSAK 16). */
  class: BudgetClass | null
  /** The saving bucket's account: budget, not money. Nothing can be spent on it (LR-7). */
  savingOnly?: boolean
  /** Accounts outside control show "Not budget controlled" and run no check. */
  controlled?: boolean
}

export const BUDGET_DEPARTMENTS: BudgetDepartment[] = [
  { id: 'NW', name: 'Networking', holder: 'Dimas Pratama' },
  { id: 'OP', name: 'Operations', holder: 'Sari Wulandari' },
  { id: 'IT', name: 'Information Technology', holder: 'Yoga Prasetyo' },
  { id: 'FN', name: 'Finance', holder: 'Hendra Gunawan' },
]

export const BUDGET_PROJECTS: BudgetProject[] = [
  { id: 'PA', name: 'Project A', description: 'Bekasi fiber ring', status: 'Active' },
  { id: 'PB', name: 'Project B', description: 'Cikarang backbone', status: 'Active' },
]

export const SAVING_ACCOUNT = '9-99000'
/** The saving bucket sits on its own company-level line. */
export const COMPANY_DEPT = 'CO'

export const BUDGET_ACCOUNTS: BudgetAccount[] = [
  { code: '6-60120', name: 'Accommodation', class: 'Opex', controlled: true },
  { code: '6-60103', name: 'Meals & Transport', class: 'Opex', controlled: true },
  { code: '6-60130', name: 'Tools & Equipment', class: 'Opex', controlled: true },
  { code: '6-60111', name: 'Office Supplies', class: 'Opex', controlled: true },
  { code: '1-17010', name: 'Fiber Optic Cable (construction in progress)', class: 'Capex', controlled: true },
  { code: '1-15020', name: 'Network Equipment', class: 'Capex', controlled: true },
  { code: '6-60140', name: 'Training', class: null, controlled: true },
  { code: '6-60104', name: 'Rent', class: 'Opex', controlled: false },
  { code: SAVING_ACCOUNT, name: 'Saving bucket', class: null, savingOnly: true, controlled: true },
]

/** People in the sample company. "View as" switches between them (no real sign-in). */
export type BudgetRole =
  | 'Requester' | 'Line Manager' | 'Budget holder (Networking)' | 'Budget holder (Operations)'
  | 'Procurement Officer' | 'AP Staff' | 'Budget Controller' | 'CFO' | 'President Director' | 'Finance Admin'

export interface BudgetPerson { role: BudgetRole; person: string; title: string; deptId: string | null }

export const BUDGET_PEOPLE: BudgetPerson[] = [
  { role: 'Requester', person: 'Andi Saputra', title: 'Splicing crew lead, Networking', deptId: 'NW' },
  { role: 'Line Manager', person: 'Budi Hartono', title: 'Field manager, Networking', deptId: 'NW' },
  { role: 'Budget holder (Networking)', person: 'Dimas Pratama', title: 'Head of Networking', deptId: 'NW' },
  { role: 'Budget holder (Operations)', person: 'Sari Wulandari', title: 'Head of Operations', deptId: 'OP' },
  { role: 'Procurement Officer', person: 'Eka Setiawan', title: 'Procurement', deptId: null },
  { role: 'AP Staff', person: 'Lina Marlina', title: 'Accounts payable', deptId: null },
  { role: 'Budget Controller', person: 'Rina Kusuma', title: 'Budget control, Finance', deptId: null },
  { role: 'CFO', person: 'Hendra Gunawan', title: 'Chief Financial Officer', deptId: 'FN' },
  { role: 'President Director', person: 'Wahyu Santoso', title: 'President Director', deptId: null },
  { role: 'Finance Admin', person: 'Maya Lestari', title: 'Finance admin', deptId: null },
]

export const CFO_NAME = 'Hendra Gunawan'
export const PRESIDENT_DIRECTOR_NAME = 'Wahyu Santoso'
export const BUDGET_CONTROLLER_NAME = 'Rina Kusuma'

export function personFor(role: BudgetRole): BudgetPerson {
  return BUDGET_PEOPLE.find((p) => p.role === role)!
}
export function deptName(id: string | null): string {
  if (id === COMPANY_DEPT) return 'Company'
  return BUDGET_DEPARTMENTS.find((d) => d.id === id)?.name ?? '-'
}
export function projectName(id: string | null): string {
  if (!id) return '(no project)'
  return BUDGET_PROJECTS.find((p) => p.id === id)?.name ?? '-'
}
export function budgetAccount(code: string): BudgetAccount | undefined {
  return BUDGET_ACCOUNTS.find((a) => a.code === code)
}
export function accountLabel(code: string): string {
  const a = budgetAccount(code)
  return a ? `${a.code} ${a.name}` : code
}
export function holderOf(deptId: string): string | null {
  return BUDGET_DEPARTMENTS.find((d) => d.id === deptId)?.holder ?? null
}

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
