/**
 * CRM › Reports (V1) — data model, field catalog, and execution engine.
 *
 * Rebuilt per "PRD: Mekari ERP CRM — Reports V1" (Confluence EC space), which
 * explicitly replaces the old Deals-pipeline-dashboard Reports content with a
 * proper report library/builder/viewer. This is a frontend-only prototype
 * (no backend, no real per-user auth), so the PRD's enterprise backend
 * concerns (multi-tenant authorization, async export workers, audit-log
 * storage, revocation-aware caching) are intentionally not implemented —
 * `CRM_CURRENT_USER` stands in for "the signed-in user" everywhere the PRD
 * says "current user." See docs/plans/cosmic-inventing-planet.md (this
 * feature's plan) for the full scope/out-of-scope breakdown.
 *
 * Simplifications vs. the literal PRD text (documented, not silent):
 *  - Criteria are a flat list joined by ONE AND/OR toggle (not nested
 *    parenthesized groups) — the simplest reading of "structured condition
 *    rows... one-level AND/OR" that keeps the builder usable.
 *  - "Related module via Lookup" is out of scope — the only single-record
 *    association types in this data model are Company/Contact, which the PRD
 *    itself excludes as related-report sources, and no other module-to-module
 *    Lookup field type exists yet.
 *  - Only the Deals module gets full field fidelity (real Deal fields +
 *    Product List line grain). Any other published custom module gets a
 *    reduced field set limited to what GenericModuleRecord actually stores.
 */
import { reactive, computed } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import {
  deals, crmModules, crmTeams, CRM_OWNERS, CRM_CURRENT_USER, CRM_WORKSPACE_OWNER,
  lineSubtotal, getCrmModule, genericRecordsFor, moduleStores,
  type Deal, type DealLineItem, type CrmModule,
} from './crm'

function load<T>(key: string, seed: T[]): T[] {
  return loadSnapshot<T>(key) ?? seed.map((x) => ({ ...x }))
}

// ─── Field catalog ────────────────────────────────────────────────────────────

export type ReportFieldType = 'text' | 'number' | 'currency' | 'date' | 'pick-list' | 'user' | 'product-list'

export interface ReportField {
  id: string
  label: string
  type: ReportFieldType
  /** Product List line-snapshot field (only meaningful in 'product-line' grain). */
  isLineField?: boolean
  options?: readonly string[]
}

const DEALS_FIELDS: ReportField[] = [
  { id: 'name', label: 'Deal name', type: 'text' },
  { id: 'company', label: 'Company', type: 'text' },
  { id: 'stage', label: 'Stage', type: 'pick-list', options: ['Open Lead', '1st Meeting', 'Proposal', 'Negotiation', 'Won', 'Lost'] },
  { id: 'owner', label: 'Owner', type: 'user', options: CRM_OWNERS },
  { id: 'priority', label: 'Priority', type: 'pick-list', options: ['Low', 'Medium', 'High', 'Critical'] },
  { id: 'value', label: 'Deal value', type: 'currency' },
  { id: 'currency', label: 'Currency', type: 'pick-list', options: ['IDR', 'USD', 'SGD', 'EUR'] },
  { id: 'referenceNumber', label: 'Reference no.', type: 'text' },
  { id: 'paymentTerms', label: 'Payment terms', type: 'text' },
  { id: 'expectedCloseDate', label: 'Expected close date', type: 'date' },
  { id: 'transactionDate', label: 'Transaction date', type: 'date' },
  { id: 'createdAt', label: 'Created date', type: 'date' },
  { id: 'lastActivity', label: 'Last activity', type: 'date' },
  { id: 'conversion', label: 'Conversion status', type: 'pick-list', options: ['not-started', 'converted', 'failed'] },
]
/** Product List line-snapshot fields — only offered under 'product-line' grain. */
const DEALS_LINE_FIELDS: ReportField[] = [
  { id: 'line.productName', label: 'Product name', type: 'text', isLineField: true },
  { id: 'line.sku', label: 'SKU', type: 'text', isLineField: true },
  { id: 'line.unit', label: 'Unit', type: 'text', isLineField: true },
  { id: 'line.quantity', label: 'Quantity', type: 'number', isLineField: true },
  { id: 'line.originalPrice', label: 'Unit price', type: 'currency', isLineField: true },
  { id: 'line.subtotal', label: 'Line subtotal', type: 'currency', isLineField: true },
]

/** Generic-module property id → the GenericModuleRecord.values key it's actually
 *  backed by. Only DEFAULT_PROPERTIES ids are ever reportable for a generic
 *  module — a custom-authored property has no real backing value slot yet. */
const GENERIC_VALUE_KEY: Record<string, keyof NonNullable<ReturnType<typeof genericRecordsFor>>[number]['values']> = {
  'company': 'customer',
  'contact-person': 'contactPerson',
  'deal-value': 'dealValue',
  'deal-name': 'name' as any,
  'owner': 'owner' as any,
  'currency': 'currency',
  'transaction-date': 'transactionDate',
  'due-date': 'dueDate',
  'close-date': 'dueDate',
  'payment-terms': 'paymentTerms',
  'reference-no': 'referenceNo',
  'message': 'description',
  'memo': 'memo',
}
const GENERIC_SYSTEM_FIELDS: ReportField[] = [
  { id: 'name', label: 'Deal name', type: 'text' },
  { id: 'stage', label: 'Stage', type: 'pick-list' },
  { id: 'owner', label: 'Owner', type: 'user', options: CRM_OWNERS },
  { id: 'createdAt', label: 'Created date', type: 'date' },
]
function genericReportableFields(moduleId: string): ReportField[] {
  const props = moduleStores(moduleId).properties
  const fromProps: ReportField[] = props
    .filter((p) => p.id in GENERIC_VALUE_KEY)
    .map((p) => ({
      id: p.id,
      label: p.name,
      type: p.id === 'deal-value' ? 'currency' : (p.id === 'transaction-date' || p.id === 'due-date') ? 'date' : 'text',
    }))
  return [...GENERIC_SYSTEM_FIELDS, ...fromProps]
}

/** Whether a module has a Product List field, i.e. offers the record/line grain choice. */
export function moduleHasProductList(moduleId: string): boolean {
  return moduleId === 'deals'
}

export function reportableFieldsFor(moduleId: string, grain: ReportGrain = 'record'): ReportField[] {
  if (moduleId === 'deals') {
    return grain === 'product-line' ? [...DEALS_FIELDS, ...DEALS_LINE_FIELDS] : DEALS_FIELDS
  }
  return genericReportableFields(moduleId)
}

export function fieldLabel(moduleId: string, grain: ReportGrain, fieldId: string): string {
  return reportableFieldsFor(moduleId, grain).find((f) => f.id === fieldId)?.label ?? fieldId
}
export function fieldType(moduleId: string, grain: ReportGrain, fieldId: string): ReportFieldType {
  return reportableFieldsFor(moduleId, grain).find((f) => f.id === fieldId)?.type ?? 'text'
}

/** Eligible source modules — active/published only, per the PRD's primary-source rule. */
export const reportSourceModules = computed<CrmModule[]>(() => crmModules.filter((m) => m.status === 'published'))

// ─── Operators (per field type) ───────────────────────────────────────────────

export interface ReportOperator { value: string; label: string; needsValue: boolean; needsSecondValue?: boolean }
export const OPERATORS_BY_TYPE: Record<ReportFieldType, ReportOperator[]> = {
  text: [
    { value: 'equals', label: 'Equals', needsValue: true },
    { value: 'contains', label: 'Contains', needsValue: true },
    { value: 'empty', label: 'Is empty', needsValue: false },
  ],
  number: [
    { value: 'equals', label: 'Equals', needsValue: true },
    { value: 'gt', label: 'Greater than', needsValue: true },
    { value: 'lt', label: 'Less than', needsValue: true },
    { value: 'between', label: 'Between', needsValue: true, needsSecondValue: true },
    { value: 'empty', label: 'Is empty', needsValue: false },
  ],
  currency: [
    { value: 'equals', label: 'Equals', needsValue: true },
    { value: 'gt', label: 'Greater than', needsValue: true },
    { value: 'lt', label: 'Less than', needsValue: true },
    { value: 'between', label: 'Between', needsValue: true, needsSecondValue: true },
    { value: 'empty', label: 'Is empty', needsValue: false },
  ],
  date: [
    { value: 'exact', label: 'On', needsValue: true },
    { value: 'before', label: 'Before', needsValue: true },
    { value: 'after', label: 'After', needsValue: true },
    { value: 'between', label: 'Between', needsValue: true, needsSecondValue: true },
    { value: 'today', label: 'Today', needsValue: false },
    { value: 'this-week', label: 'This week', needsValue: false },
    { value: 'this-month', label: 'This month', needsValue: false },
    { value: 'last-7-days', label: 'Last 7 days', needsValue: false },
    { value: 'last-30-days', label: 'Last 30 days', needsValue: false },
    { value: 'empty', label: 'Is empty', needsValue: false },
  ],
  'pick-list': [
    { value: 'is', label: 'Is', needsValue: true },
    { value: 'is-not', label: 'Is not', needsValue: true },
    { value: 'any-of', label: 'Any of', needsValue: true },
    { value: 'empty', label: 'Is empty', needsValue: false },
  ],
  user: [
    { value: 'is', label: 'Is', needsValue: true },
    { value: 'is-not', label: 'Is not', needsValue: true },
    { value: 'any-of', label: 'Any of', needsValue: true },
  ],
  'product-list': [
    { value: 'equals', label: 'Equals', needsValue: true },
    { value: 'contains', label: 'Contains', needsValue: true },
  ],
}

// ─── Report definition ────────────────────────────────────────────────────────

export type ReportVisibility = 'private' | 'selected' | 'everyone'
export type ReportStatus = 'active' | 'archived'
export type ReportGrain = 'record' | 'product-line'
export type ReportAggFn = 'count' | 'sum' | 'average' | 'min' | 'max'
export type CriteriaLogic = 'AND' | 'OR'
export type DateBucket = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface ReportCriterion {
  id: string
  fieldId: string
  operator: string
  value?: string | number
  value2?: string | number   // for 'between'
}
export interface ReportGrouping {
  fieldId: string
  dateBucket?: DateBucket
  showDetailRows: boolean
}
export interface ReportMeasure {
  fn: ReportAggFn
  fieldId?: string   // required except for 'count'
}

export interface CrmReport {
  id: string
  ownerId: string
  name: string
  description?: string
  primaryModuleId: string
  grain: ReportGrain
  columns: string[]                 // field ids, in display order
  criteria: ReportCriterion[]
  criteriaLogic: CriteriaLogic
  grouping?: ReportGrouping
  measures: ReportMeasure[]
  sort?: { fieldId: string; direction: 'asc' | 'desc' }
  visibility: ReportVisibility
  sharedUserIds?: string[]
  sharedTeamIds?: string[]
  status: ReportStatus
  createdAt: string
  updatedAt: string
  updatedBy: string
}

export const DESCRIPTION_MAX = 500
export const REPORT_NAME_MAX = 100

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
function today(): string {
  return new Date().toISOString()
}

const REPORTS_SEED: CrmReport[] = [
  {
    id: 'rpt-1',
    ownerId: CRM_CURRENT_USER,
    name: 'Deals expected to close this month',
    description: 'Open deals grouped by owner, with total expected value.',
    primaryModuleId: 'deals',
    grain: 'record',
    columns: ['name', 'company', 'stage', 'owner', 'value', 'expectedCloseDate'],
    criteria: [{ id: 'c1', fieldId: 'stage', operator: 'is-not', value: 'Won' }, { id: 'c2', fieldId: 'stage', operator: 'is-not', value: 'Lost' }],
    criteriaLogic: 'AND',
    grouping: { fieldId: 'owner', showDetailRows: true },
    measures: [{ fn: 'count' }, { fn: 'sum', fieldId: 'value' }],
    sort: { fieldId: 'expectedCloseDate', direction: 'asc' },
    visibility: 'everyone',
    status: 'active',
    createdAt: '2026-08-01T09:00:00',
    updatedAt: '2026-08-20T09:00:00',
    updatedBy: CRM_CURRENT_USER,
  },
  {
    id: 'rpt-2',
    ownerId: CRM_CURRENT_USER,
    name: 'Overdue deals',
    description: 'Open deals past their expected close date.',
    primaryModuleId: 'deals',
    grain: 'record',
    columns: ['name', 'company', 'owner', 'stage', 'expectedCloseDate', 'value'],
    criteria: [{ id: 'c1', fieldId: 'expectedCloseDate', operator: 'before', value: today().slice(0, 10) }],
    criteriaLogic: 'AND',
    measures: [{ fn: 'count' }],
    visibility: 'private',
    status: 'active',
    createdAt: '2026-08-05T09:00:00',
    updatedAt: '2026-08-05T09:00:00',
    updatedBy: CRM_CURRENT_USER,
  },
  {
    id: 'rpt-3',
    ownerId: 'Dewi Lestari',
    name: 'Won deals by product',
    description: 'Won deals, one row per product line, grouped by product.',
    primaryModuleId: 'deals',
    grain: 'product-line',
    columns: ['name', 'company', 'line.productName', 'line.quantity', 'line.subtotal'],
    criteria: [{ id: 'c1', fieldId: 'stage', operator: 'is', value: 'Won' }],
    criteriaLogic: 'AND',
    grouping: { fieldId: 'line.productName', showDetailRows: false },
    measures: [{ fn: 'sum', fieldId: 'line.quantity' }, { fn: 'sum', fieldId: 'line.subtotal' }],
    visibility: 'selected',
    sharedUserIds: [CRM_CURRENT_USER],
    status: 'active',
    createdAt: '2026-08-10T09:00:00',
    updatedAt: '2026-08-18T09:00:00',
    updatedBy: 'Dewi Lestari',
  },
]

export const crmReports = reactive<CrmReport[]>(load('crm-reports-v1', REPORTS_SEED))
export function persistCrmReports() { saveSnapshot('crm-reports-v1', crmReports) }

export function getCrmReport(id: string): CrmReport | undefined {
  return crmReports.find((r) => r.id === id)
}

export interface CrmReportInput {
  name: string
  description?: string
  primaryModuleId: string
  grain: ReportGrain
  columns: string[]
  criteria: ReportCriterion[]
  criteriaLogic: CriteriaLogic
  grouping?: ReportGrouping
  measures: ReportMeasure[]
  sort?: { fieldId: string; direction: 'asc' | 'desc' }
  visibility: ReportVisibility
  sharedUserIds?: string[]
  sharedTeamIds?: string[]
}

export function addCrmReport(input: CrmReportInput): CrmReport {
  const report: CrmReport = {
    id: newId('rpt'),
    ownerId: CRM_CURRENT_USER,
    status: 'active',
    createdAt: today(),
    updatedAt: today(),
    updatedBy: CRM_CURRENT_USER,
    ...input,
  }
  crmReports.push(report)
  persistCrmReports()
  return report
}

export function updateCrmReport(id: string, input: CrmReportInput): void {
  const r = getCrmReport(id)
  if (!r) return
  Object.assign(r, input)
  r.updatedAt = today()
  r.updatedBy = CRM_CURRENT_USER
  persistCrmReports()
}

export function cloneCrmReport(id: string): CrmReport | null {
  const src = getCrmReport(id)
  if (!src) return null
  const clone: CrmReport = {
    ...src,
    id: newId('rpt'),
    ownerId: CRM_CURRENT_USER,
    name: `${src.name} (copy)`,
    visibility: 'private',
    sharedUserIds: undefined,
    sharedTeamIds: undefined,
    status: 'active',
    createdAt: today(),
    updatedAt: today(),
    updatedBy: CRM_CURRENT_USER,
  }
  crmReports.push(clone)
  persistCrmReports()
  return clone
}

export function archiveCrmReport(id: string): void {
  const r = getCrmReport(id)
  if (r) { r.status = 'archived'; r.updatedAt = today(); r.updatedBy = CRM_CURRENT_USER; persistCrmReports() }
}
export function restoreCrmReport(id: string): void {
  const r = getCrmReport(id)
  if (r) { r.status = 'active'; r.updatedAt = today(); r.updatedBy = CRM_CURRENT_USER; persistCrmReports() }
}
export function deleteCrmReport(id: string): void {
  const i = crmReports.findIndex((r) => r.id === id)
  if (i >= 0) { crmReports.splice(i, 1); persistCrmReports() }
}
/** Archive/Delete are restricted to the workspace owner ("super admin" stand-in,
 *  always full access in this mock) or the report's own owner. */
export function canManageReport(r: CrmReport): boolean {
  return CRM_CURRENT_USER === CRM_WORKSPACE_OWNER || r.ownerId === CRM_CURRENT_USER
}
export function transferCrmReport(id: string, newOwnerId: string): void {
  const r = getCrmReport(id)
  if (r) { r.ownerId = newOwnerId; r.updatedAt = today(); r.updatedBy = CRM_CURRENT_USER; persistCrmReports() }
}
export function setCrmReportVisibility(id: string, visibility: ReportVisibility, sharedUserIds?: string[], sharedTeamIds?: string[]): void {
  const r = getCrmReport(id)
  if (!r) return
  r.visibility = visibility
  r.sharedUserIds = sharedUserIds
  r.sharedTeamIds = sharedTeamIds
  r.updatedAt = today()
  r.updatedBy = CRM_CURRENT_USER
  persistCrmReports()
}

/** "My reports" / "Shared with me" / "All accessible" — mock discovery rules
 *  standing in for the PRD's deny-wins authorization intersection. */
export function reportIsMine(r: CrmReport): boolean { return r.ownerId === CRM_CURRENT_USER }
export function reportIsSharedWithMe(r: CrmReport): boolean {
  if (reportIsMine(r)) return false
  if (r.visibility === 'everyone') return true
  if (r.visibility === 'selected') return !!r.sharedUserIds?.includes(CRM_CURRENT_USER)
  return false
}
export function reportIsAccessibleToMe(r: CrmReport): boolean {
  return reportIsMine(r) || reportIsSharedWithMe(r)
}

// ─── Execution engine ─────────────────────────────────────────────────────────

export interface ReportRow { key: string; cells: Record<string, unknown>; _sourceId: string }
export interface ReportGroupResult { key: string; label: string; rows: ReportRow[]; totals: Record<string, number> }
export interface CrmReportResult {
  columns: string[]
  rows: ReportRow[]              // ungrouped: all rows
  groups: ReportGroupResult[] | null
  grandTotals: Record<string, number>
}

function dealValue(d: Deal, fieldId: string): unknown {
  switch (fieldId) {
    case 'name': return d.name
    case 'company': return d.company
    case 'stage': return d.stage
    case 'owner': return d.owner
    case 'priority': return d.priority
    case 'value': return d.value
    case 'currency': return d.currency
    case 'referenceNumber': return d.referenceNumber ?? ''
    case 'paymentTerms': return d.paymentTerms ?? ''
    case 'expectedCloseDate': return d.expectedCloseDate
    case 'transactionDate': return d.transactionDate ?? d.createdAt
    case 'createdAt': return d.createdAt
    case 'lastActivity': return d.lastActivity
    case 'conversion': return d.conversion
    default: return undefined
  }
}
function lineValue(li: DealLineItem, fieldId: string): unknown {
  switch (fieldId) {
    case 'line.productName': return li.productName
    case 'line.sku': return li.sku ?? ''
    case 'line.unit': return li.unit
    case 'line.quantity': return li.quantity
    case 'line.originalPrice': return li.originalPrice
    case 'line.subtotal': return lineSubtotal(li)
    default: return undefined
  }
}
function genericValue(rec: ReturnType<typeof genericRecordsFor>[number], fieldId: string): unknown {
  if (fieldId === 'name') return rec.name
  if (fieldId === 'stage') return rec.stage
  if (fieldId === 'owner') return rec.owner
  if (fieldId === 'createdAt') return rec.createdAt
  const key = GENERIC_VALUE_KEY[fieldId]
  return key ? rec.values[key] : undefined
}

function cellValue(moduleId: string, fieldId: string, sourceRow: unknown, line?: DealLineItem): unknown {
  if (fieldId.startsWith('line.')) return line ? lineValue(line, fieldId) : undefined
  if (moduleId === 'deals') return dealValue(sourceRow as Deal, fieldId)
  return genericValue(sourceRow as ReturnType<typeof genericRecordsFor>[number], fieldId)
}

function isDateField(moduleId: string, grain: ReportGrain, fieldId: string): boolean {
  return fieldType(moduleId, grain, fieldId) === 'date'
}

function matchesCriterion(moduleId: string, grain: ReportGrain, sourceRow: unknown, line: DealLineItem | undefined, c: ReportCriterion): boolean {
  const raw = cellValue(moduleId, c.fieldId, sourceRow, line)
  const isDate = isDateField(moduleId, grain, c.fieldId)
  if (c.operator === 'empty') return raw === undefined || raw === null || raw === ''
  if (raw === undefined || raw === null || raw === '') return false

  if (isDate) {
    const v = String(raw).slice(0, 10)
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    switch (c.operator) {
      case 'exact': return v === c.value
      case 'before': return v < String(c.value)
      case 'after': return v > String(c.value)
      case 'between': return v >= String(c.value) && v <= String(c.value2)
      case 'today': return v === todayStr
      case 'this-week': {
        const d = new Date(now); d.setDate(now.getDate() - now.getDay())
        return v >= d.toISOString().slice(0, 10) && v <= todayStr
      }
      case 'this-month': return v.slice(0, 7) === todayStr.slice(0, 7)
      case 'last-7-days': {
        const d = new Date(now); d.setDate(now.getDate() - 7)
        return v >= d.toISOString().slice(0, 10) && v <= todayStr
      }
      case 'last-30-days': {
        const d = new Date(now); d.setDate(now.getDate() - 30)
        return v >= d.toISOString().slice(0, 10) && v <= todayStr
      }
      default: return true
    }
  }

  const type = fieldType(moduleId, grain, c.fieldId)
  if (type === 'number' || type === 'currency') {
    const n = Number(raw)
    const cv = Number(c.value)
    switch (c.operator) {
      case 'equals': return n === cv
      case 'gt': return n > cv
      case 'lt': return n < cv
      case 'between': return n >= cv && n <= Number(c.value2)
      default: return true
    }
  }

  const s = String(raw).toLowerCase()
  const cv = String(c.value ?? '').toLowerCase()
  switch (c.operator) {
    case 'equals': case 'is': return s === cv
    case 'is-not': return s !== cv
    case 'contains': return s.includes(cv)
    case 'any-of': return cv.split(',').map((x) => x.trim()).includes(s)
    default: return true
  }
}

function matchesAll(moduleId: string, grain: ReportGrain, sourceRow: unknown, line: DealLineItem | undefined, criteria: ReportCriterion[], logic: CriteriaLogic): boolean {
  if (!criteria.length) return true
  const results = criteria.map((c) => matchesCriterion(moduleId, grain, sourceRow, line, c))
  return logic === 'AND' ? results.every(Boolean) : results.some(Boolean)
}

function bucketDate(iso: string, bucket: DateBucket): string {
  const d = new Date(iso)
  if (bucket === 'year') return String(d.getFullYear())
  if (bucket === 'quarter') return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
  if (bucket === 'month') return iso.slice(0, 7)
  if (bucket === 'week') { const s = new Date(d); s.setDate(d.getDate() - d.getDay()); return s.toISOString().slice(0, 10) }
  return iso.slice(0, 10)
}

function computeMeasure(rows: ReportRow[], m: ReportMeasure): number {
  if (m.fn === 'count') return rows.length
  const nums = rows.map((r) => Number(r.cells[m.fieldId!])).filter((n) => !Number.isNaN(n))
  if (!nums.length) return 0
  if (m.fn === 'sum') return nums.reduce((a, b) => a + b, 0)
  if (m.fn === 'average') return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
  if (m.fn === 'min') return Math.min(...nums)
  return Math.max(...nums)
}
export function measureKey(m: ReportMeasure): string { return m.fn === 'count' ? 'count' : `${m.fn}:${m.fieldId}` }

export function runCrmReport(def: CrmReport, opts: { quickCriteria?: ReportCriterion[]; quickLogic?: CriteriaLogic; limit?: number } = {}): CrmReportResult {
  const { primaryModuleId: moduleId, grain, columns, criteria, criteriaLogic, grouping, measures } = def
  const allCriteria = [...criteria, ...(opts.quickCriteria ?? [])]
  const logic = opts.quickCriteria?.length ? (opts.quickLogic ?? criteriaLogic) : criteriaLogic

  const rows: ReportRow[] = []
  if (moduleId === 'deals') {
    for (const d of deals) {
      if (d.archived) continue
      if (grain === 'product-line') {
        for (const li of d.products ?? []) {
          if (!matchesAll(moduleId, grain, d, li, allCriteria, logic)) continue
          const cells: Record<string, unknown> = {}
          for (const col of columns) cells[col] = cellValue(moduleId, col, d, li)
          for (const m of measures) if (m.fieldId) cells[m.fieldId] = cellValue(moduleId, m.fieldId, d, li)
          if (grouping) cells[grouping.fieldId] = cellValue(moduleId, grouping.fieldId, d, li)
          rows.push({ key: `${d.id}:${li.productId}`, cells, _sourceId: d.id })
        }
      } else {
        if (!matchesAll(moduleId, grain, d, undefined, allCriteria, logic)) continue
        const cells: Record<string, unknown> = {}
        for (const col of columns) cells[col] = cellValue(moduleId, col, d)
        for (const m of measures) if (m.fieldId) cells[m.fieldId] = cellValue(moduleId, m.fieldId, d)
        if (grouping) cells[grouping.fieldId] = cellValue(moduleId, grouping.fieldId, d)
        rows.push({ key: d.id, cells, _sourceId: d.id })
      }
    }
  } else {
    for (const rec of genericRecordsFor(moduleId)) {
      if (!matchesAll(moduleId, grain, rec, undefined, allCriteria, logic)) continue
      const cells: Record<string, unknown> = {}
      for (const col of columns) cells[col] = cellValue(moduleId, col, rec)
      for (const m of measures) if (m.fieldId) cells[m.fieldId] = cellValue(moduleId, m.fieldId, rec)
      if (grouping) cells[grouping.fieldId] = cellValue(moduleId, grouping.fieldId, rec)
      rows.push({ key: rec.id, cells, _sourceId: rec.id })
    }
  }

  if (def.sort) {
    const { fieldId, direction } = def.sort
    rows.sort((a, b) => {
      const av = a.cells[fieldId] ?? cellValue(moduleId, fieldId, undefined)
      const bv = b.cells[fieldId] ?? cellValue(moduleId, fieldId, undefined)
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
      return direction === 'asc' ? cmp : -cmp
    })
  }

  const grandTotals: Record<string, number> = {}
  for (const m of measures) grandTotals[measureKey(m)] = computeMeasure(rows, m)

  let groups: ReportGroupResult[] | null = null
  if (grouping) {
    const isDate = isDateField(moduleId, grain, grouping.fieldId)
    const map = new Map<string, ReportRow[]>()
    for (const row of rows) {
      const raw = row.cells[grouping.fieldId]
      const key = raw == null || raw === '' ? '__empty__' : (isDate && grouping.dateBucket ? bucketDate(String(raw), grouping.dateBucket) : String(raw))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    groups = [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([key, groupRows]) => {
        const totals: Record<string, number> = {}
        for (const m of measures) totals[measureKey(m)] = computeMeasure(groupRows, m)
        return { key, label: key === '__empty__' ? 'Empty' : key, rows: groupRows, totals }
      })
  }

  const limited = opts.limit ? rows.slice(0, opts.limit) : rows
  return { columns, rows: limited, groups, grandTotals }
}

// ─── Module metric pins (lightweight — see plan for what's deliberately omitted) ──

export interface CrmMetricPin {
  id: string
  moduleId: string
  reportId: string
  measure: ReportMeasure
  label: string
  order: number
}
export const MAX_PINS_PER_MODULE = 6
export const crmMetricPins = reactive<CrmMetricPin[]>(load('crm-metric-pins-v1', []))
export function persistCrmMetricPins() { saveSnapshot('crm-metric-pins-v1', crmMetricPins) }

export function pinsForModule(moduleId: string): CrmMetricPin[] {
  return crmMetricPins.filter((p) => p.moduleId === moduleId).sort((a, b) => a.order - b.order)
}
/** A report is metric-compatible when it has an ungrouped (or grand-total-only)
 *  scalar summary: Count, or one Sum/Average/Min/Max on the primary module. */
export function compatibleMeasures(def: CrmReport): ReportMeasure[] {
  return def.measures.filter((m) => m.fn === 'count' || !m.fieldId?.startsWith('line.'))
}
export function pinReportMetric(moduleId: string, reportId: string, measure: ReportMeasure, label: string): CrmMetricPin | null {
  if (pinsForModule(moduleId).length >= MAX_PINS_PER_MODULE) return null
  const pin: CrmMetricPin = { id: newId('pin'), moduleId, reportId, measure, label, order: pinsForModule(moduleId).length }
  crmMetricPins.push(pin)
  persistCrmMetricPins()
  return pin
}
export function unpinReportMetric(id: string): void {
  const i = crmMetricPins.findIndex((p) => p.id === id)
  if (i >= 0) { crmMetricPins.splice(i, 1); persistCrmMetricPins() }
}
export function metricPinValue(pin: CrmMetricPin): number | null {
  const def = getCrmReport(pin.reportId)
  if (!def || def.status !== 'active') return null
  const result = runCrmReport(def)
  return result.grandTotals[measureKey(pin.measure)] ?? null
}

// ─── Sharing helpers (Users/Teams pickers reuse existing CRM data) ───────────

export const REPORT_OWNER_OPTIONS = CRM_OWNERS
export function crmTeamOptions() {
  return crmTeams.filter((t) => t.status === 'active').map((t) => ({ value: t.id, label: t.name }))
}
export { getCrmModule }
