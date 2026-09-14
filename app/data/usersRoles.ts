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
  /**
   * The permission bullets shown when fullAccessOption is CHECKED — replaces
   * `permissions` (the default/restricted set) for as long as it's ticked.
   */
  fullAccessPermissions?: string[]
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
      'View and create deals, contacts, and companies assigned to you.',
      'View and manage the pipeline for your own deals, including changing stage.',
      'View pages of customer contacts, products, and other lists.',
      'Edit and delete your own deals, contacts, and companies if ticking List manager.',
    ],
    fullAccessOption: 'Full access to all CRM data and settings (CRM Administrator)',
    fullAccessPermissions: [
      'View and create all CRM deals, contacts, and companies.',
      'View and manage the entire deal pipeline, including changing stage and owner.',
      'View CRM reports.',
      'Manage CRM settings: create custom modules, set user permissions, and create teams.',
      'Edit and delete any deals, contacts, and companies if ticking List manager.',
    ],
    accessLimitation: 'Restrict this user to deals they are assigned to',
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
  { value: 'create', label: 'Create' },
  { value: 'edit', label: 'Edit' },
  { value: 'delete', label: 'Delete' },
]

/** The "Feature" quick-filter categories — Figma "Drawer / Custom Role / Add". */
export type AuthorityCategory =
  | 'accounting' | 'sales' | 'purchases' | 'expenses' | 'contacts'
  | 'inventory' | 'warehouses' | 'reports' | 'settings'

export const AUTHORITY_CATEGORIES: { value: AuthorityCategory; label: string }[] = [
  { value: 'accounting', label: 'Accounting' },
  { value: 'sales', label: 'Sales' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'warehouses', label: 'Warehouses' },
  { value: 'reports', label: 'Reports' },
  { value: 'settings', label: 'Settings' },
]

/** Level 3 — a leaf under a level-2 row (e.g. Settings ▸ Sales ▸ General settings ▸ Sales quote). */
export interface AuthorityChild { id: string; label: string }

/** Level 2 — a leaf row, or (rarely) its own expandable group of level-3 children. */
export interface AuthoritySubfeature {
  id: string
  label: string
  children?: AuthorityChild[]
}

/** Level 1 — a row in the permission table; expandable when it has subfeatures. */
export interface AuthorityFeature {
  id: string
  label: string
  category: AuthorityCategory
  subfeatures: AuthoritySubfeature[]
  /** Report-style features are view-only — their create/edit/delete cells are omitted. */
  viewOnly?: boolean
}

/** The full permission matrix — verbatim from Figma "Drawer / Custom Role / Add"
 *  (kbjbVaG7fw9Jzv2jX1zBDf, node 4426:29058), grouped by the Feature filter's
 *  9 categories in the same order as the filter dropdown. */
export const AUTHORITY_FEATURES: AuthorityFeature[] = [
  // ── Accounting ──
  {
    id: 'acc-cash-management', label: 'Cash management', category: 'accounting',
    subfeatures: [
      { id: 'transfer-money', label: 'Transfer money' },
      { id: 'receive-money', label: 'Receive money' },
      { id: 'spend-money', label: 'Spend money' },
    ],
  },
  { id: 'acc-reconciliations', label: 'Reconciliations', category: 'accounting', subfeatures: [] },
  {
    id: 'acc-consolidation', label: 'Consolidation', category: 'accounting',
    subfeatures: [
      { id: 'consolidations', label: 'Consolidations' },
      { id: 'business-units', label: 'Business units' },
      { id: 'consolidation-accounts', label: 'Consolidation accounts' },
      { id: 'elimination-rules', label: 'Elimination rules' },
    ],
  },
  { id: 'acc-chart-of-accounts', label: 'Chart of accounts', category: 'accounting', subfeatures: [] },
  { id: 'acc-close-books', label: 'Close books', category: 'accounting', subfeatures: [] },
  { id: 'acc-fixed-assets', label: 'Fixed assets', category: 'accounting', subfeatures: [] },

  // ── Sales ──
  { id: 'sales-quotes', label: 'Sales quotes', category: 'sales', subfeatures: [] },
  { id: 'sales-orders', label: 'Sales orders', category: 'sales', subfeatures: [] },
  { id: 'sales-deliveries', label: 'Sales deliveries', category: 'sales', subfeatures: [] },
  { id: 'sales-invoices', label: 'Sales invoices', category: 'sales', subfeatures: [] },
  { id: 'sales-return', label: 'Sales return', category: 'sales', subfeatures: [] },
  { id: 'sales-payment-terms-info', label: 'Payment terms information', category: 'sales', subfeatures: [] },

  // ── Purchases ──
  { id: 'purch-requests', label: 'Purchase requests', category: 'purchases', subfeatures: [] },
  { id: 'purch-quotes', label: 'Purchase quotes', category: 'purchases', subfeatures: [] },
  { id: 'purch-orders', label: 'Purchase orders', category: 'purchases', subfeatures: [] },
  { id: 'purch-receipts', label: 'Purchase receipts', category: 'purchases', subfeatures: [] },
  { id: 'purch-deliveries', label: 'Purchase deliveries', category: 'purchases', subfeatures: [] },
  { id: 'purch-invoices', label: 'Purchase invoices', category: 'purchases', subfeatures: [] },
  { id: 'purch-returns', label: 'Purchase returns', category: 'purchases', subfeatures: [] },
  { id: 'purch-payments', label: 'Purchase payments', category: 'purchases', subfeatures: [] },
  { id: 'purch-payment-terms-info', label: 'Payment terms information', category: 'purchases', subfeatures: [] },

  // ── Expenses ──
  { id: 'exp-expenses', label: 'Expenses', category: 'expenses', subfeatures: [] },
  { id: 'exp-pay-bills', label: 'Pay bills', category: 'expenses', subfeatures: [] },

  // ── Contacts ──
  {
    id: 'contacts-customers', label: 'Customers', category: 'contacts',
    subfeatures: [
      { id: 'customers', label: 'Customers' },
      { id: 'contact-groups', label: 'Contact groups' },
    ],
  },
  {
    id: 'contacts-vendors', label: 'Vendors', category: 'contacts',
    subfeatures: [
      { id: 'vendors', label: 'Vendors' },
      { id: 'contact-groups', label: 'Contact groups' },
    ],
  },
  {
    id: 'contacts-employees', label: 'Employees', category: 'contacts',
    subfeatures: [
      { id: 'employees', label: 'Employees' },
      { id: 'contact-groups', label: 'Contact groups' },
    ],
  },
  {
    id: 'contacts-others', label: 'Others', category: 'contacts',
    subfeatures: [
      { id: 'others', label: 'Others' },
      { id: 'contact-groups', label: 'Contact groups' },
    ],
  },

  // ── Inventory ──
  { id: 'inv-products', label: 'Products', category: 'inventory', subfeatures: [] },
  { id: 'inv-stock-adjustments', label: 'Stock adjustments', category: 'inventory', subfeatures: [] },
  { id: 'inv-fulfillments', label: 'Fulfillments', category: 'inventory', subfeatures: [] },

  // ── Warehouses ──
  { id: 'wh-warehouses', label: 'Warehouses', category: 'warehouses', subfeatures: [] },

  // ── Reports (view-only) ──
  { id: 'rep-financial', label: 'Financial reports', category: 'reports', subfeatures: [], viewOnly: true },
  { id: 'rep-sales', label: 'Sales reports', category: 'reports', subfeatures: [], viewOnly: true },
  { id: 'rep-purchase', label: 'Purchase reports', category: 'reports', subfeatures: [], viewOnly: true },
  { id: 'rep-inventory', label: 'Inventory reports', category: 'reports', subfeatures: [], viewOnly: true },
  { id: 'rep-asset', label: 'Asset reports', category: 'reports', subfeatures: [], viewOnly: true },
  { id: 'rep-bank', label: 'Bank reports', category: 'reports', subfeatures: [], viewOnly: true },
  { id: 'rep-tax', label: 'Tax reports', category: 'reports', subfeatures: [], viewOnly: true },
  { id: 'rep-production', label: 'Production reports', category: 'reports', subfeatures: [], viewOnly: true },

  // ── Settings ──
  { id: 'set-company-profile', label: 'Company profile', category: 'settings', subfeatures: [] },
  { id: 'set-billing', label: 'Billing', category: 'settings', subfeatures: [] },
  {
    id: 'set-users-roles', label: 'Users & roles', category: 'settings',
    subfeatures: [
      { id: 'users', label: 'Users' },
      { id: 'custom-roles', label: 'Custom roles' },
    ],
  },
  {
    id: 'set-sales', label: 'Sales', category: 'settings',
    subfeatures: [
      {
        id: 'general-settings', label: 'General settings',
        children: [
          { id: 'sales-quote', label: 'Sales quote' },
          { id: 'sales-order', label: 'Sales order' },
          { id: 'sales-invoice', label: 'Sales invoice' },
          { id: 'delivery-note', label: 'Delivery note' },
          { id: 'receipt', label: 'Receipt' },
        ],
      },
      { id: 'invoice-reminder', label: 'Invoice reminder' },
    ],
  },
  {
    id: 'set-purchases', label: 'Purchases', category: 'settings',
    subfeatures: [
      {
        id: 'general-settings', label: 'General settings',
        children: [
          { id: 'purchase-orders', label: 'Purchase orders' },
          { id: 'purchase-invoices', label: 'Purchase invoices' },
        ],
      },
    ],
  },
  {
    id: 'set-inventory', label: 'Inventory', category: 'settings',
    subfeatures: [
      { id: 'product-settings', label: 'Product settings' },
      { id: 'batch-reminders', label: 'Batch reminders' },
      { id: 'warehouse-settings', label: 'Warehouse settings' },
    ],
  },
  { id: 'set-production', label: 'Production', category: 'settings', subfeatures: [] },
  { id: 'set-default-accounts', label: 'Default accounts', category: 'settings', subfeatures: [] },
  { id: 'set-approval-workflow', label: 'Approval workflow', category: 'settings', subfeatures: [] },
  { id: 'set-tagging-rules', label: 'Tagging rules', category: 'settings', subfeatures: [] },
  { id: 'set-tax-rates', label: 'Tax rates', category: 'settings', subfeatures: [] },
  { id: 'set-currencies', label: 'Currencies', category: 'settings', subfeatures: [] },
  { id: 'set-payment-terms', label: 'Payment terms', category: 'settings', subfeatures: [] },
  { id: 'set-payment-methods', label: 'Payment methods', category: 'settings', subfeatures: [] },
  { id: 'set-tags', label: 'Tags', category: 'settings', subfeatures: [] },
]

/**
 * Which actions are granted, keyed `"<featureId>"` for a feature with no
 * sub-features, or `"<featureId>.<subfeatureId>"`. A missing key = no access.
 */
export type AuthorityGrants = Record<string, AuthorityAction[]>

/** Every leaf row key under one level-2 subfeature — itself, or one per level-3 child. */
export function authoritySubRowKeys(featureId: string, sub: AuthoritySubfeature): string[] {
  if (!sub.children?.length) return [`${featureId}.${sub.id}`]
  return sub.children.map((c) => `${featureId}.${sub.id}.${c.id}`)
}

/** Every leaf row key the feature renders — itself, or recursing through subfeatures/children. */
export function authorityRowKeys(feature: AuthorityFeature): string[] {
  if (!feature.subfeatures.length) return [feature.id]
  return feature.subfeatures.flatMap((s) => authoritySubRowKeys(feature.id, s))
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
      'wh-warehouses': ['view', 'create', 'edit', 'delete'],
      'inv-products': ['view'],
      'inv-stock-adjustments': ['view', 'create'],
      'inv-fulfillments': ['view', 'create'],
      'rep-inventory': ['view'],
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
      'purch-invoices': ['view', 'create', 'edit'],
      'purch-payments': ['view', 'create'],
      'purch-orders': ['view'],
      'exp-expenses': ['view', 'create'],
      'contacts-vendors.vendors': ['view'],
      'rep-purchase': ['view'],
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
      'sales-invoices': ['view'],
      'purch-invoices': ['view'],
      'rep-tax': ['view'],
      'rep-sales': ['view'],
      'rep-purchase': ['view'],
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
