/**
 * Settings › Users & roles — the mock DB behind the user list, the custom-role
 * builder, and the invite-user form.
 *
 * Benchmarked on Jurnal's "User management" (Invite user / User list / Custom
 * role), re-expressed in ERP terms: the existing-role catalogue keeps Jurnal's
 * nine roles but their permission bullets talk about the modules THIS app has
 * (warehouses, production, stock adjustments), and the authority matrix features
 * mirror the ERP sidebar rather than Jurnal's.
 *
 * Data only — mutations are in-memory (this is a prototype), same convention as
 * approvalWorkflows.ts.
 */
import { reactive } from 'vue'

// ─── Existing (system) roles ─────────────────────────────────────────────────

/** Extra checkbox groups a role can carry, below its permission bullets. */
export interface RoleAuthorityGroup {
  /** Group heading, e.g. "Default sales authority". */
  label: string
  options: { value: string; label: string }[]
}

export interface SystemRole {
  id: string
  name: string
  /** What the role can do — rendered as a bulleted list under the role. */
  permissions: string[]
  /** Optional per-module authority checkboxes (Sales / Purchasing). */
  authorityGroup?: RoleAuthorityGroup
  /**
   * Optional "Access limitation" checkbox — restricts the user to transactions
   * they created themselves. Only meaningful once the role is ticked.
   */
  accessLimitation?: string
  /**
   * Optional "Full access" checkbox — the inverse shape of accessLimitation:
   * unchecked (default) scopes the role to its own records; checking it elevates
   * the user to see/manage everyone's data within the module (a module-level
   * administrator). Only meaningful once the role is ticked.
   */
  fullAccessOption?: string
  /** Owner/Ultimate can't be time-limited (see ACCESS_TIME_LIMIT_NOTE). */
  supportsTimeLimit: boolean
  /**
   * Role only exists for tenants that bought the Project Accounting billing
   * component — same gate as the matching authority feature and the Approval
   * workflows "Applies to: Project Action" condition. Gated roles are omitted
   * from the picker entirely, not shown-disabled.
   */
  requiresProjectAccounting?: boolean
}

export const SYSTEM_ROLES: SystemRole[] = [
  {
    id: 'ultimate',
    name: 'Ultimate',
    permissions: [
      'Invite new users.',
      'View and add all transaction data.',
      'View all pages, except the billing page.',
      'Edit and delete data if ticking List manager.',
    ],
    supportsTimeLimit: false,
  },
  {
    id: 'administrator',
    name: 'Administrator',
    permissions: ['View settings pages, except the billing page.'],
    supportsTimeLimit: true,
  },
  {
    id: 'accountant',
    name: 'Accountant',
    permissions: [
      'View all reports.',
      'Create new accounts and the general journal from the chart of accounts page.',
      'View all data on sales, purchases, expenses, and stock adjustments.',
      'View pages of cash & bank, customer and vendor contacts, products, chart of accounts, and other lists.',
      'Edit and delete data on chart of accounts and other lists pages if ticking List manager.',
    ],
    supportsTimeLimit: true,
  },
  {
    id: 'report-reader',
    name: 'Report reader',
    permissions: ['View all reports.'],
    supportsTimeLimit: true,
  },
  {
    id: 'banker',
    name: 'Banker',
    permissions: [
      'Do bank reconciliation and see its report.',
      'View and add accounts along with transactions on the cash & bank page.',
      'Edit and delete data on the cash & bank page if ticking List manager.',
    ],
    accessLimitation: 'Restrict this user to view cash & bank transactions created by other users',
    supportsTimeLimit: true,
  },
  {
    id: 'sales',
    name: 'Sales',
    permissions: [
      'View and create all sales functions.',
      'View all sales reports.',
      'Add new products.',
      "View the product's selling price and product list.",
      'View pages of customer contacts, products, other lists, and sales settings.',
      'Edit and delete data of sales transactions, products, and customers if ticking List manager.',
    ],
    authorityGroup: {
      label: 'Default sales authority',
      options: [
        { value: 'invoice-and-return', label: 'Invoice and return' },
        { value: 'order-and-quote', label: 'Order and quote' },
        { value: 'payment', label: 'Payment' },
      ],
    },
    accessLimitation: 'Restrict this user to view sales transactions created by other users',
    supportsTimeLimit: true,
  },
  {
    id: 'purchasing',
    name: 'Purchasing',
    permissions: [
      'View and add all purchase functions.',
      'View all purchase reports.',
      'Add new products.',
      "View the product's buying price and product list.",
      'View pages of vendor contacts, products, other lists, and purchase settings.',
      'Edit and delete data of purchase transactions, products, and vendors if ticking List manager.',
    ],
    authorityGroup: {
      label: 'Default purchasing authority',
      options: [
        { value: 'invoice-and-return', label: 'Invoice and return' },
        { value: 'order-and-quote', label: 'Order and quote' },
        { value: 'payment', label: 'Payment' },
        { value: 'request', label: 'Request' },
      ],
    },
    accessLimitation: 'Restrict this user to view purchase transactions created by other users',
    supportsTimeLimit: true,
  },
  {
    id: 'expenses',
    name: 'Expenses',
    permissions: [
      'View and create all expense functions.',
      'View all expense reports.',
      'View pages of vendor contacts and other lists.',
      'Edit and delete data of expenses and vendors if ticking List manager.',
    ],
    accessLimitation: 'Restrict this user to view expense transactions created by other users',
    supportsTimeLimit: true,
  },
  {
    id: 'stockist',
    name: 'Stockist',
    permissions: [
      'Add new products.',
      'View product list and quantity.',
      'View and adjust product stock (stock opname).',
      'View all product reports.',
      'View pages of other lists and product settings.',
      'Edit and delete product data if ticking List manager.',
    ],
    supportsTimeLimit: true,
  },
  {
    id: 'project-manager',
    name: 'Project Manager',
    requiresProjectAccounting: true,
    permissions: [
      'Create and set up projects, including budget and milestones.',
      'View and record project costs.',
      'View and submit revenue recognition and project billing.',
      'Create and submit variation orders and other change requests.',
      'View all project health and profitability reports.',
      'Edit and delete project data if ticking List manager.',
    ],
    accessLimitation: 'Restrict this user to projects they are assigned to',
    supportsTimeLimit: true,
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    permissions: [
      'View and process inbound and outbound delivery tasks.',
      'View and create warehouse transfers and cycle counts.',
      'View warehouse and storage location pages.',
      'Edit and delete warehouse task data if ticking List manager.',
    ],
    accessLimitation: 'Restrict this user to warehouses they are assigned to',
    supportsTimeLimit: true,
  },
  {
    id: 'crm',
    name: 'CRM',
    permissions: [
      'View and create all CRM deals, contacts, and companies.',
      'View and manage the deal pipeline, including changing stage and owner.',
      'View pages of customer contacts, products, other lists, and CRM settings.',
      'Edit and delete data of deals, contacts, and companies if ticking List manager.',
    ],
    fullAccessOption: 'Full access to all CRM data and settings (CRM Administrator)',
    supportsTimeLimit: true,
  },
]

export function getSystemRole(id: string): SystemRole | undefined {
  return SYSTEM_ROLES.find((r) => r.id === id)
}

/**
 * The existing roles this tenant can actually assign. Pass whether the Project
 * Accounting billing component is installed (useApprovalWorkflowScenario) —
 * without it, Project Manager is dropped from the picker.
 */
export function systemRolesFor(hasProjectAccounting: boolean): SystemRole[] {
  return SYSTEM_ROLES.filter((r) => !r.requiresProjectAccounting || hasProjectAccounting)
}

/** Shown under the "Apply access time limits" checkbox. */
export const ACCESS_TIME_LIMIT_NOTE =
  'Can be applied to all roles except Owner and Ultimate with List manager ticked.'

/** Terms shown in the info card beside the Role picker. */
export const ROLE_SELECTION_TERMS = [
  'Custom role authority is dominant — it is always the reference for role management.',
  'If you select more than one custom role, the authority from each custom role is merged.',
]

// ─── Access time limits ──────────────────────────────────────────────────────

export const ACCESS_DAY_OPTIONS = [
  { value: 'mon-fri', label: 'Monday - Friday' },
  { value: 'mon-sat', label: 'Monday - Saturday' },
  { value: 'everyday', label: 'Every day' },
]

/** 00:00 … 23:00 — the hour pickers are whole hours, same as Jurnal. */
export const ACCESS_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const v = `${String(h).padStart(2, '0')}:00`
  return { value: v, label: v }
})

export interface AccessTimeLimit {
  days: string
  startHour: string
  endHour: string
}

export function emptyAccessTimeLimit(): AccessTimeLimit {
  return { days: 'mon-fri', startHour: '08:00', endHour: '17:00' }
}

export function accessDayLabel(value: string): string {
  return ACCESS_DAY_OPTIONS.find((o) => o.value === value)?.label ?? value
}

// ─── Authority matrix (custom roles) ─────────────────────────────────────────

export type AuthorityAction = 'view' | 'create' | 'edit' | 'delete'

export const AUTHORITY_ACTIONS: { value: AuthorityAction; label: string }[] = [
  { value: 'view', label: 'View' },
  { value: 'create', label: 'Create/Add' },
  { value: 'edit', label: 'Edit' },
  { value: 'delete', label: 'Delete' },
]

export interface AuthorityFeature {
  id: string
  label: string
  /** Sub-features get their own permission row; a feature with none is one row. */
  subfeatures: { id: string; label: string }[]
  /** Report-style features are view-only — their create/edit/delete cells are omitted. */
  viewOnly?: boolean
  /**
   * Feature only exists for tenants that bought the Project Accounting billing
   * component — the same gate the Approval workflows "Applies to: Project
   * Action" condition uses (useApprovalWorkflowScenario). Gated features are
   * omitted from the matrix entirely, not shown-disabled: a tenant without the
   * component can't grant authority over a module they don't have.
   */
  requiresProjectAccounting?: boolean
}

/** Mirrors the ERP sidebar, not Jurnal's module list. */
export const AUTHORITY_FEATURES: AuthorityFeature[] = [
  {
    id: 'cash-and-bank',
    label: 'Cash & bank',
    subfeatures: [
      { id: 'bank-transfer', label: 'Bank transfer' },
      { id: 'bank-deposit', label: 'Bank deposit' },
      { id: 'bank-withdrawal', label: 'Bank withdrawal' },
      { id: 'reconciliation', label: 'Reconciliation' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    subfeatures: [
      { id: 'sales-quote', label: 'Sales quote' },
      { id: 'sales-order', label: 'Sales order' },
      { id: 'sales-invoice', label: 'Sales invoice' },
      { id: 'sales-payment', label: 'Sales payment' },
      { id: 'credit-memo', label: 'Credit memo' },
    ],
  },
  {
    id: 'purchases',
    label: 'Purchases',
    subfeatures: [
      { id: 'purchase-request', label: 'Purchase request' },
      { id: 'purchase-order', label: 'Purchase order' },
      { id: 'purchase-invoice', label: 'Purchase invoice' },
      { id: 'purchase-payment', label: 'Purchase payment' },
    ],
  },
  { id: 'expenses', label: 'Expenses', subfeatures: [] },
  {
    id: 'product',
    label: 'Product',
    subfeatures: [
      { id: 'product-list', label: 'Product list' },
      { id: 'stock-adjustment', label: 'Stock adjustment' },
      { id: 'warehouse-transfer', label: 'Warehouse transfer' },
    ],
  },
  {
    id: 'warehouse',
    label: 'Warehouse',
    subfeatures: [
      { id: 'inbound-delivery', label: 'Inbound delivery' },
      { id: 'outbound-delivery', label: 'Outbound delivery' },
      { id: 'cycle-count', label: 'Cycle count' },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    subfeatures: [
      { id: 'work-order', label: 'Work order' },
      { id: 'bill-of-materials', label: 'Bill of materials' },
    ],
  },
  {
    id: 'project-accounting',
    label: 'Project Accounting',
    requiresProjectAccounting: true,
    subfeatures: [
      { id: 'project-setup', label: 'Project setup' },
      { id: 'cost-tracking', label: 'Cost tracking' },
      { id: 'recognition-and-billing', label: 'Recognition and billing' },
      { id: 'change-management', label: 'Change management' },
      { id: 'project-health', label: 'Project health' },
    ],
  },
  { id: 'contacts', label: 'Contacts', subfeatures: [] },
  { id: 'business-overview-report', label: 'Business overview report', subfeatures: [], viewOnly: true },
  { id: 'sales-report', label: 'Sales report', subfeatures: [], viewOnly: true },
  { id: 'purchases-report', label: 'Purchases report', subfeatures: [], viewOnly: true },
  { id: 'product-report', label: 'Product report', subfeatures: [], viewOnly: true },
  { id: 'warehouse-report', label: 'Warehouse report', subfeatures: [], viewOnly: true },
  { id: 'bank-report', label: 'Bank report', subfeatures: [], viewOnly: true },
  { id: 'tax-report', label: 'Tax report', subfeatures: [], viewOnly: true },
]

/**
 * Which actions are granted, keyed `"<featureId>"` for a feature with no
 * sub-features, or `"<featureId>.<subfeatureId>"`. A missing key = no access.
 */
export type AuthorityGrants = Record<string, AuthorityAction[]>

/**
 * The features this tenant can actually grant. Pass whether the Project
 * Accounting billing component is installed (useApprovalWorkflowScenario) —
 * without it, that feature is dropped from the matrix.
 */
export function authorityFeaturesFor(hasProjectAccounting: boolean): AuthorityFeature[] {
  return AUTHORITY_FEATURES.filter((f) => !f.requiresProjectAccounting || hasProjectAccounting)
}

/** Row keys the matrix renders for one feature (itself, or one per sub-feature). */
export function authorityRowKeys(feature: AuthorityFeature): string[] {
  if (!feature.subfeatures.length) return [feature.id]
  return feature.subfeatures.map((s) => `${feature.id}.${s.id}`)
}

/** Actions a feature's rows can actually hold — reports are view-only. */
export function authorityActionsFor(feature: AuthorityFeature): AuthorityAction[] {
  return feature.viewOnly ? ['view'] : ['view', 'create', 'edit', 'delete']
}

/** How many features have at least one granted action — the "Feature (n)" count. */
export function grantedFeatureCount(grants: AuthorityGrants): number {
  return AUTHORITY_FEATURES.filter((f) =>
    authorityRowKeys(f).some((k) => (grants[k]?.length ?? 0) > 0),
  ).length
}

// ─── Custom roles ────────────────────────────────────────────────────────────

export interface CustomRole {
  id: string
  name: string
  description: string
  grants: AuthorityGrants
  /** How many users currently carry this role. */
  assignedUsers: number
  updatedAt: string
  updatedBy: string
}

export const DESCRIPTION_MAX = 400
export const ROLE_NAME_MAX = 60

export const customRoles = reactive<CustomRole[]>([
  {
    id: 'cr-1',
    name: 'Warehouse supervisor',
    description: 'Runs the floor: inbound, outbound and cycle counts, plus read-only stock reports.',
    grants: {
      'warehouse.inbound-delivery': ['view', 'create', 'edit'],
      'warehouse.outbound-delivery': ['view', 'create', 'edit'],
      'warehouse.cycle-count': ['view', 'create', 'edit', 'delete'],
      'product.product-list': ['view'],
      'product.stock-adjustment': ['view', 'create'],
      'warehouse-report': ['view'],
      'product-report': ['view'],
    },
    assignedUsers: 4,
    updatedAt: '2026-08-24T09:12:00+07:00',
    updatedBy: 'Rizal Candra',
  },
  {
    id: 'cr-2',
    name: 'AP clerk',
    description: 'Records vendor bills and payments. Cannot approve or delete purchase documents.',
    grants: {
      'purchases.purchase-invoice': ['view', 'create', 'edit'],
      'purchases.purchase-payment': ['view', 'create'],
      'purchases.purchase-order': ['view'],
      'expenses': ['view', 'create'],
      'contacts': ['view'],
      'purchases-report': ['view'],
    },
    assignedUsers: 2,
    updatedAt: '2026-08-11T16:40:00+07:00',
    updatedBy: 'Evelyn Bellinda',
  },
  {
    id: 'cr-3',
    name: 'Tax reviewer',
    description: 'Read-only across sales, purchases and tax reporting for the monthly review.',
    grants: {
      'sales.sales-invoice': ['view'],
      'purchases.purchase-invoice': ['view'],
      'tax-report': ['view'],
      'sales-report': ['view'],
      'purchases-report': ['view'],
    },
    assignedUsers: 1,
    updatedAt: '2026-07-30T11:05:00+07:00',
    updatedBy: 'Rizal Candra',
  },
])

export interface CustomRoleInput {
  name: string
  description: string
  grants: AuthorityGrants
}

let customRoleSeq = customRoles.length

export function getCustomRole(id: string): CustomRole | undefined {
  return customRoles.find((r) => r.id === id)
}

export function addCustomRole(input: CustomRoleInput): CustomRole {
  const role: CustomRole = {
    id: `cr-${++customRoleSeq}`,
    name: input.name,
    description: input.description,
    grants: input.grants,
    assignedUsers: 0,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Rizal Candra',
  }
  customRoles.push(role)
  return role
}

export function updateCustomRole(id: string, input: CustomRoleInput): void {
  const role = getCustomRole(id)
  if (!role) return
  role.name = input.name
  role.description = input.description
  role.grants = input.grants
  role.updatedAt = new Date().toISOString()
  role.updatedBy = 'Rizal Candra'
}

export function deleteCustomRole(id: string): void {
  const i = customRoles.findIndex((r) => r.id === id)
  if (i >= 0) customRoles.splice(i, 1)
}

// ─── Users ───────────────────────────────────────────────────────────────────

/** Owner is the account holder — exactly one, and it can't be edited or removed. */
export type AccountUserStatus = 'active' | 'invited' | 'inactive'

export interface AccountUser {
  id: string
  name: string
  email: string
  /** Owner short-circuits the role list — an Owner row shows just "Owner". */
  isOwner: boolean
  /** SYSTEM_ROLES ids. */
  systemRoleIds: string[]
  /** customRoles ids. */
  customRoleIds: string[]
  isListManager: boolean
  timeLimit: AccessTimeLimit | null
  status: AccountUserStatus
  /** ISO timestamp; null while the invitation is still pending. */
  lastActiveAt: string | null
  /** ISO date the user was invited/created. */
  joinedAt: string
}

export const accountUsers = reactive<AccountUser[]>([
  {
    id: 'au-1',
    name: 'Rizal Candra',
    email: 'rizal.candra@mekari.com',
    isOwner: true,
    systemRoleIds: [],
    customRoleIds: [],
    isListManager: true,
    timeLimit: null,
    status: 'active',
    lastActiveAt: '2026-09-08T08:42:00+07:00',
    joinedAt: '2025-01-10',
  },
  {
    id: 'au-2',
    name: 'Evelyn Bellinda',
    email: 'evelyn.bellinda@mekari.com',
    isOwner: false,
    systemRoleIds: ['accountant', 'banker'],
    customRoleIds: [],
    isListManager: true,
    timeLimit: null,
    status: 'active',
    lastActiveAt: '2026-09-07T17:20:00+07:00',
    joinedAt: '2025-03-02',
  },
  {
    id: 'au-3',
    name: 'Cinta Ayu',
    email: 'cinta.ayu@mekari.com',
    isOwner: false,
    systemRoleIds: ['sales', 'purchasing'],
    customRoleIds: [],
    isListManager: false,
    timeLimit: { days: 'mon-fri', startHour: '08:00', endHour: '17:00' },
    status: 'active',
    lastActiveAt: '2026-09-08T07:55:00+07:00',
    joinedAt: '2025-04-18',
  },
  {
    id: 'au-4',
    name: 'Jessie Tan',
    email: 'jessie.tan@mekari.com',
    isOwner: false,
    systemRoleIds: ['stockist'],
    customRoleIds: ['cr-1'],
    isListManager: false,
    timeLimit: { days: 'mon-sat', startHour: '07:00', endHour: '16:00' },
    status: 'active',
    lastActiveAt: '2026-09-06T14:03:00+07:00',
    joinedAt: '2025-05-27',
  },
  {
    id: 'au-5',
    name: 'Bayu Ferdian',
    email: 'bayu.ferdian@mekari.com',
    isOwner: false,
    systemRoleIds: [],
    customRoleIds: ['cr-2'],
    isListManager: false,
    timeLimit: null,
    status: 'invited',
    lastActiveAt: null,
    joinedAt: '2026-09-10',
  },
  {
    id: 'au-6',
    name: 'Galih Prakoso',
    email: 'galih.prakoso@mekari.com',
    isOwner: false,
    systemRoleIds: ['report-reader'],
    customRoleIds: ['cr-3'],
    isListManager: false,
    timeLimit: null,
    status: 'active',
    lastActiveAt: '2026-09-05T09:31:00+07:00',
    joinedAt: '2025-07-14',
  },
  {
    id: 'au-7',
    name: 'Indah Permata',
    email: 'indah.permata@mekari.com',
    isOwner: false,
    systemRoleIds: ['expenses'],
    customRoleIds: [],
    isListManager: false,
    timeLimit: null,
    status: 'inactive',
    lastActiveAt: '2026-05-19T10:12:00+07:00',
    joinedAt: '2025-02-20',
  },
  {
    id: 'au-8',
    name: 'Andi Pratama',
    email: 'andi.pratama@mekari.com',
    isOwner: false,
    systemRoleIds: ['warehouse'],
    customRoleIds: ['cr-1'],
    isListManager: false,
    timeLimit: { days: 'everyday', startHour: '06:00', endHour: '22:00' },
    status: 'active',
    lastActiveAt: '2026-09-08T06:14:00+07:00',
    joinedAt: '2025-06-05',
  },
  {
    id: 'au-9',
    name: 'Alfian Ramadhan',
    email: 'alfian.ramadhan@mekari.com',
    isOwner: false,
    systemRoleIds: ['administrator'],
    customRoleIds: [],
    isListManager: true,
    timeLimit: null,
    status: 'active',
    lastActiveAt: '2026-09-04T13:48:00+07:00',
    joinedAt: '2025-08-22',
  },
  {
    id: 'au-10',
    name: 'Fajar Nugraha',
    email: 'fajar.nugraha@mekari.com',
    isOwner: false,
    systemRoleIds: ['ultimate'],
    customRoleIds: [],
    isListManager: false,
    timeLimit: null,
    status: 'invited',
    lastActiveAt: null,
    joinedAt: '2026-09-09',
  },
  {
    id: 'au-11',
    name: 'Ali Imran',
    email: 'ali.imran@mekari.com',
    isOwner: false,
    systemRoleIds: ['project-manager'],
    customRoleIds: [],
    isListManager: true,
    timeLimit: null,
    status: 'active',
    lastActiveAt: '2026-09-08T09:05:00+07:00',
    joinedAt: '2025-09-30',
  },
])

export interface AccountUserInput {
  name: string
  email: string
  systemRoleIds: string[]
  customRoleIds: string[]
  isListManager: boolean
  timeLimit: AccessTimeLimit | null
}

let accountUserSeq = accountUsers.length

export function getAccountUser(id: string): AccountUser | undefined {
  return accountUsers.find((u) => u.id === id)
}

export function addAccountUser(input: AccountUserInput): AccountUser {
  const user: AccountUser = {
    id: `au-${++accountUserSeq}`,
    ...input,
    isOwner: false,
    status: 'invited',
    lastActiveAt: null,
    joinedAt: new Date().toISOString().slice(0, 10),
  }
  accountUsers.push(user)
  bumpAssignedUserCounts()
  return user
}

export function updateAccountUser(id: string, input: AccountUserInput): void {
  const user = getAccountUser(id)
  if (!user) return
  Object.assign(user, input)
  bumpAssignedUserCounts()
}

export function setAccountUserStatus(id: string, status: AccountUserStatus): void {
  const user = getAccountUser(id)
  if (user) user.status = status
}

export function deleteAccountUser(id: string): void {
  const i = accountUsers.findIndex((u) => u.id === id)
  if (i >= 0) accountUsers.splice(i, 1)
  bumpAssignedUserCounts()
}

/** Keep each custom role's "Users assigned" derived from the user list. */
function bumpAssignedUserCounts(): void {
  for (const role of customRoles) {
    role.assignedUsers = accountUsers.filter((u) => u.customRoleIds.includes(role.id)).length
  }
}
bumpAssignedUserCounts()

/** Role chips for a user row: "Owner", or every existing + custom role name. */
export function userRoleNames(user: AccountUser): string[] {
  if (user.isOwner) return ['Owner']
  const system = user.systemRoleIds.map((id) => getSystemRole(id)?.name).filter((n): n is string => !!n)
  const custom = user.customRoleIds.map((id) => getCustomRole(id)?.name).filter((n): n is string => !!n)
  return [...system, ...custom]
}

/** "Existing" / "Custom" / "Owner" — the User list "Type" filter. */
export type UserRoleType = 'owner' | 'existing' | 'custom'

export function userRoleTypes(user: AccountUser): UserRoleType[] {
  if (user.isOwner) return ['owner']
  const types: UserRoleType[] = []
  if (user.systemRoleIds.length) types.push('existing')
  if (user.customRoleIds.length) types.push('custom')
  return types
}

const USER_ROLE_TYPE_LABELS: Record<UserRoleType, string> = {
  owner: 'Owner',
  existing: 'Existing role',
  custom: 'Custom role',
}

/** Display labels for the Type column — "Owner", or "Existing role" / "Custom role". */
export function userRoleTypeLabels(user: AccountUser): string[] {
  return userRoleTypes(user).map((t) => USER_ROLE_TYPE_LABELS[t])
}

/** Human-readable access window, or "—" when the user has no limit. */
export function timeLimitText(user: AccountUser): string {
  if (!user.timeLimit) return '—'
  const { days, startHour, endHour } = user.timeLimit
  return `${accessDayLabel(days)}, ${startHour}–${endHour}`
}
