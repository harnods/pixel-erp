/**
 * CRM → ERP Transaction Conversion — configuration + runtime model.
 * Implements the prototype behaviour of the PRD "ERP Transaction Conversion
 * Settings V1" (docs/prd/crm-erp-conversion-settings-prd.md).
 *
 * Shape of the feature (see the PRD invariants):
 *  • One conversion CONFIG per module (Deals + custom modules). A config has an
 *    Enabled flag, ONE target (Sales Quote OR Sales Order — never Expense), a
 *    single mapping list (one entry per ERP target field), and — for custom
 *    modules only — at most one blocking criterion.
 *  • Readiness is derived from the mapping (Not configured / Disabled draft /
 *    Ready / Needs attention …) — never trusted from the client at runtime.
 *  • At runtime an authorized user MANUALLY converts one record into exactly one
 *    ERP transaction via a read-only review + confirm. One success per record, ever.
 *
 * This is a clickable prototype: persistence is localStorage (app/data/persist.ts);
 * the exactly-once / outbox / idempotency machinery is represented in the state
 * model + UI, not as real distributed infrastructure.
 */
import { reactive, computed } from 'vue'
import { loadSnapshot, saveSnapshot } from '~/data/persist'
import {
  crmModules, getCrmModule, getDeal, dealTotals, lineSubtotal, persistCrmDeals,
  moduleStores,
  type CrmModule, type CrmModuleField, type CrmFieldType, type Deal,
  type DealProperty, type DealPropertyType,
} from '~/data/crm'
import { salesOrders } from '~/data/salesOrders'
import { salesQuotes } from '~/data/salesQuotes'
import type { SalesOrder, SalesOrderItem, SalesQuote } from '~/data/types'

// ── Targets ──────────────────────────────────────────────────────────────────
// PRD: Sales Quote + Sales Order ONLY. Expense is fully deferred — it is NOT a
// member of this type on purpose (the module builder's legacy `expense` option is
// swept in Phase 3).
export type ConvTarget = 'sales-quote' | 'sales-order'
export const CONV_TARGET_LABEL: Record<ConvTarget, string> = {
  'sales-quote': 'Sales Quote',
  'sales-order': 'Sales Order',
}

// ── ERP target-field catalog ───────────────────────────────────────────────
// The fields an ERP Sales Quote / Sales Order exposes for mapping. Category drives
// the field-type compatibility matrix; requirement drives readiness.
export type ErpFieldCategory =
  | 'customer' | 'product-lines' | 'date' | 'text' | 'email-phone-url'
  | 'currency-code' | 'money' | 'decimal' | 'percentage' | 'boolean' | 'erp-option'
export type FieldRequirement = 'required' | 'conditional' | 'optional'

export interface ErpTargetField {
  key: string
  label: string
  requirement: FieldRequirement
  category: ErpFieldCategory
  /** What the field is for in ERP — shown on the mapping row. */
  purpose: string
  /** Conditional fields note WHEN they become required. */
  conditionNote?: string
}

// Common fields shared by Sales Quote + Sales Order (PRD §Common mapping +
// §Sales Quote / §Sales Order mapping requirements).
const COMMON_ERP_FIELDS: ErpTargetField[] = [
  { key: 'customer',     label: 'ERP Customer',        requirement: 'required',    category: 'customer',      purpose: 'The ERP customer the transaction bills to' },
  { key: 'txDate',       label: 'Transaction date',    requirement: 'required',    category: 'date',          purpose: 'Date the ERP transaction is dated' },
  { key: 'dueDate',      label: 'Due date',            requirement: 'required',    category: 'date',          purpose: 'Payment due date' },
  { key: 'paymentTerm',  label: 'Payment term',        requirement: 'conditional', category: 'erp-option',    purpose: 'ERP payment term', conditionNote: 'Required unless a company default term applies' },
  { key: 'productLines', label: 'Product lines',       requirement: 'required',    category: 'product-lines', purpose: 'Line items (product, qty, price, discount, tax) — 1–100 lines' },
  { key: 'currency',     label: 'Currency',            requirement: 'required',    category: 'currency-code', purpose: 'Transaction currency code' },
  { key: 'exchangeRate', label: 'Exchange rate',       requirement: 'conditional', category: 'decimal',       purpose: 'Rate to base currency', conditionNote: 'Required when the currency is not the company base currency' },
  { key: 'warehouse',    label: 'Warehouse',           requirement: 'conditional', category: 'erp-option',    purpose: 'Source warehouse', conditionNote: 'Required when the tenant tracks inventory' },
  // Optional (PRD: never required for completeness; if mapped, must be valid)
  { key: 'billingAddress',   label: 'Billing address',   requirement: 'optional', category: 'text',           purpose: 'Billing address override' },
  { key: 'shippingAddress',  label: 'Shipping address',  requirement: 'optional', category: 'text',           purpose: 'Shipping address override' },
  { key: 'shipDate',         label: 'Shipping / delivery date', requirement: 'optional', category: 'date',    purpose: 'Requested delivery date' },
  { key: 'shipVia',          label: 'Ship via',          requirement: 'optional', category: 'erp-option',     purpose: 'Shipping method' },
  { key: 'referenceNo',      label: 'Reference number',  requirement: 'optional', category: 'text',           purpose: 'External reference (RFQ/PO no.)' },
  { key: 'shippingFee',      label: 'Shipping fee',      requirement: 'optional', category: 'money',          purpose: 'Flat shipping charge' },
  { key: 'memo',             label: 'Memo',              requirement: 'optional', category: 'text',           purpose: 'Internal note carried to ERP' },
]

/** Sales Quote adds Expiry date (quote validity); Sales Order has no expiry. */
const QUOTE_ONLY: ErpTargetField = {
  key: 'expiryDate', label: 'Expiry date', requirement: 'required', category: 'date',
  purpose: 'Date the quote is valid until (Sales Quote only)',
}

export function erpTargetFields(target: ConvTarget): ErpTargetField[] {
  if (target === 'sales-quote') {
    // Expiry sits right after Due date.
    const out: ErpTargetField[] = []
    for (const f of COMMON_ERP_FIELDS) {
      out.push(f)
      if (f.key === 'dueDate') out.push(QUOTE_ONLY)
    }
    return out
  }
  return COMMON_ERP_FIELDS
}

// ── Mapping source strategies (PRD §Mapping source strategies — the 4 kinds) ──
export type SourceStrategy = 'unmapped' | 'crm-field' | 'system' | 'fixed' | 'erp-default'
export const SOURCE_STRATEGY_LABEL: Record<SourceStrategy, string> = {
  unmapped: 'Unmapped',
  'crm-field': 'CRM field',
  system: 'System-derived',
  fixed: 'Fixed value',
  'erp-default': 'ERP default',
}

/** System-derived values (strategy 2): computed at conversion, not stored per field. */
export type SystemValueKey =
  | 'conversion-date' | 'base-currency' | 'erp-customer-id' | 'record-id'
  | 'primary-name' | 'current-company' | 'acting-user' | 'rate-one'
export const SYSTEM_VALUE_LABEL: Record<SystemValueKey, string> = {
  'conversion-date': 'Conversion date',
  'base-currency': 'Company base currency',
  'erp-customer-id': 'Verified ERP Customer ID',
  'record-id': 'Module record ID',
  'primary-name': 'Primary Record Name',
  'current-company': 'Current company',
  'acting-user': 'Acting user',
  'rate-one': 'Exchange rate 1.0',
}

/** One mapping row: a target field ← a source. */
export interface MappingEntry {
  targetKey: string
  strategy: SourceStrategy
  /** strategy 'crm-field' → a CrmModuleField id on the module. */
  sourceFieldId?: string
  /** strategy 'system' → which derived value. */
  systemValue?: SystemValueKey
  /** strategy 'fixed'/'erp-default' → a fixed label/value shown on the row. */
  fixedLabel?: string
  /** Deals defaults are protected — shown read-only in the editor. */
  protected?: boolean
}

// ── Custom-module blocking criterion (PRD §Conversion limitation) ─────────────
// Exactly ONE field + ONE operator + ONE typed value. Deals cannot have one (they
// use the fixed Lost-stage rule).
export type CriterionOperator = 'equals' | 'contains'
export interface BlockingCriterion {
  fieldId: string
  operator: CriterionOperator
  value: string
}

// ── Config state machine (PRD §Configuration states and readiness) ────────────
export type ConfigState =
  | 'not-configured'
  | 'disabled-incomplete'
  | 'disabled-valid'
  | 'ready'
  | 'needs-attention'
  | 'needs-revalidation'
  | 'module-inactive'
export const CONFIG_STATE_LABEL: Record<ConfigState, string> = {
  'not-configured': 'Not configured',
  'disabled-incomplete': 'Disabled — incomplete draft',
  'disabled-valid': 'Disabled — valid draft',
  ready: 'Ready',
  'needs-attention': 'Needs attention',
  'needs-revalidation': 'Needs revalidation',
  'module-inactive': 'Module inactive',
}
/** Compact label for the narrow "Mapping readiness" table cell — the Conversion
 *  column already shows Enabled/Disabled, so the readiness badge drops that prefix. */
export const CONFIG_STATE_SHORT: Record<ConfigState, string> = {
  'not-configured': 'Not configured',
  'disabled-incomplete': 'Incomplete draft',
  'disabled-valid': 'Valid draft',
  ready: 'Ready',
  'needs-attention': 'Needs attention',
  'needs-revalidation': 'Needs revalidation',
  'module-inactive': 'Inactive',
}
/** Badge type for ErpStatusBadge (text+icon, never colour-only per PRD). */
export function configStateBadge(s: ConfigState): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (s === 'ready') return 'success'
  if (s === 'needs-attention') return 'danger'
  if (s === 'needs-revalidation') return 'warning'
  if (s === 'disabled-valid') return 'info'
  if (s === 'module-inactive') return 'neutral'
  return 'neutral'
}

export interface ConversionConfig {
  moduleId: string
  enabled: boolean
  target: ConvTarget
  mappings: MappingEntry[]
  /** custom modules only; absent for Deals. */
  criterion?: BlockingCriterion | null
  /** Optimistic-lock revision (PRD) — bumped on each save; never shown on records. */
  revision: number
  /** true once the current mapping has been validated since the last edit. */
  validated: boolean
  lastSavedBy?: string
  lastSavedAt?: string
  lastValidatedAt?: string
}

// ── Seed configs ──────────────────────────────────────────────────────────────
// Deals ships a complete, protected Sales-Order mapping (Ready after validation);
// Service deals ships a partial disabled draft to demonstrate the incomplete state.
function dealsSeed(): ConversionConfig {
  return {
    moduleId: 'deals', enabled: true, target: 'sales-order', validated: true, revision: 3,
    lastSavedBy: 'Rizal Candra', lastSavedAt: '2026-09-10T14:30:00', lastValidatedAt: '2026-09-10T14:30:00',
    criterion: null,
    mappings: [
      { targetKey: 'customer',     strategy: 'crm-field', sourceFieldId: 'company' },
      { targetKey: 'txDate',       strategy: 'crm-field', sourceFieldId: 'transaction-date' },
      { targetKey: 'dueDate',      strategy: 'crm-field', sourceFieldId: 'due-date' },
      { targetKey: 'paymentTerm',  strategy: 'crm-field', sourceFieldId: 'payment-term' },
      { targetKey: 'productLines', strategy: 'crm-field', sourceFieldId: 'product-list' },
      { targetKey: 'currency',     strategy: 'crm-field', sourceFieldId: 'currency-code' },
      { targetKey: 'billingAddress', strategy: 'crm-field', sourceFieldId: 'billing-address' },
      { targetKey: 'shippingAddress', strategy: 'crm-field', sourceFieldId: 'shipping-address' },
      { targetKey: 'referenceNo',  strategy: 'crm-field', sourceFieldId: 'external-reference-id' },
      { targetKey: 'memo',         strategy: 'crm-field', sourceFieldId: 'memo' },
    ],
  }
}
const CONFIGS_SEED: ConversionConfig[] = [dealsSeed()]
export const conversionConfigs = reactive<ConversionConfig[]>(
  load('crm-conversion-configs-v4', CONFIGS_SEED),
)
export function persistConversionConfigs() { saveSnapshot('crm-conversion-configs-v4', conversionConfigs) }

function load<T>(key: string, fallback: T): T {
  return (loadSnapshot<T>(key) as T) ?? fallback
}

// ── Accessors ───────────────────────────────────────────────────────────────
export function getConversionConfig(moduleId: string): ConversionConfig | undefined {
  return conversionConfigs.find((c) => c.moduleId === moduleId)
}

/** Every eligible module gets a row on the settings list. A module with no saved
 *  config yet is surfaced as a virtual "Not configured" row. */
export function ensureConversionConfig(moduleId: string): ConversionConfig {
  let cfg = getConversionConfig(moduleId)
  if (!cfg) {
    cfg = { moduleId, enabled: false, target: 'sales-order', mappings: [], criterion: null, revision: 0, validated: false }
    conversionConfigs.push(cfg)
    persistConversionConfigs()
  }
  return cfg
}

// ── Field-type compatibility (PRD §Field-type compatibility) ──────────────────
/** Which CRM field types can feed an ERP target category. */
const CATEGORY_CRM_TYPES: Record<ErpFieldCategory, CrmFieldType[]> = {
  customer: ['customer'],
  'product-lines': ['product-list'],
  date: ['date'],
  text: ['text', 'pick-list', 'radio'],
  'email-phone-url': ['text'],
  'currency-code': ['pick-list', 'radio', 'text'],
  money: ['currency', 'number'],
  decimal: ['number'],
  percentage: ['number'],
  boolean: [],                  // fixed only in V1
  'erp-option': ['pick-list', 'radio'],
}
export function compatibleCrmTypes(category: ErpFieldCategory): CrmFieldType[] {
  return CATEGORY_CRM_TYPES[category]
}
/** Which non-crm-field strategies a category can use. */
export function allowedStrategies(field: ErpTargetField): SourceStrategy[] {
  const out: SourceStrategy[] = ['unmapped']
  if (CATEGORY_CRM_TYPES[field.category].length) out.push('crm-field')
  out.push('system', 'fixed', 'erp-default')
  return out
}

// ── Per-entry status (PRD §Mapping row experience) ────────────────────────────
export type EntryStatus = 'compatible' | 'missing' | 'incompatible' | 'unmapped-optional'
export interface EntryEval { status: EntryStatus; message?: string }

const PROPERTY_TYPE_TO_CRM: Record<DealPropertyType, CrmFieldType | null> = {
  'Single-line text': 'text', 'Multi-line text': 'text', 'URL': 'text', 'Email': 'text',
  'Phone number': 'text', 'Number': 'number', 'Calculation': 'number', 'Rollup': 'number',
  'Date picker': 'date', 'Date and time picker': 'date',
  'Dropdown select': 'pick-list', 'Radio select': 'radio',
  'Single checkbox': 'radio', 'Multiple checkboxes': 'pick-list',
  'User': 'user', 'Product list': 'product-list',
  'Company': 'customer', 'Contact': 'customer',
  'Related list': null, 'File': null,
}

export function evalEntry(entry: MappingEntry, field: ErpTargetField, mod: CrmModule, properties?: DealProperty[]): EntryEval {
  const required = field.requirement === 'required'
  if (entry.strategy === 'unmapped') {
    if (required) return { status: 'missing', message: `${field.label} is required — map a source.` }
    return { status: 'unmapped-optional' }
  }
  if (entry.strategy === 'crm-field') {
    const props = properties ?? moduleStores(mod.id).properties
    const p = props.find((x) => x.id === entry.sourceFieldId)
    if (p) {
      const crmType = PROPERTY_TYPE_TO_CRM[p.type]
      if (crmType && !compatibleCrmTypes(field.category).includes(crmType)) {
        return { status: 'incompatible', message: `${p.name} (${p.type}) is not compatible with ${field.label}.` }
      }
      return { status: 'compatible' }
    }
    const f = mod.fields.find((x) => x.id === entry.sourceFieldId)
    if (!f) return { status: 'incompatible', message: 'Mapped CRM field no longer exists.' }
    if (!compatibleCrmTypes(field.category).includes(f.type)) {
      return { status: 'incompatible', message: `${f.label} (${f.type}) is not compatible with ${field.label}.` }
    }
  }
  return { status: 'compatible' }
}

// ── Readiness (PRD §Configuration states and readiness) ───────────────────────
export function configState(cfg: ConversionConfig): ConfigState {
  const mod = getCrmModule(cfg.moduleId)
  if (mod && mod.status !== 'published') {
    // A previously-published module gone inactive keeps its config read-only.
    if (cfg.mappings.length && mod.status === 'draft' && cfg.enabled) return 'module-inactive'
  }
  if (!cfg.mappings.length && !cfg.enabled) return 'not-configured'

  const props = moduleStores(cfg.moduleId).properties
  const fields = erpTargetFields(cfg.target)
  const anyBroken = fields.some((f) => {
    const e = cfg.mappings.find((m) => m.targetKey === f.key)
    const status = evalEntry(e ?? { targetKey: f.key, strategy: 'unmapped' }, f, mod ?? ({ fields: [] } as unknown as CrmModule), props).status
    return status === 'missing' || status === 'incompatible'
  })

  if (cfg.enabled) {
    if (anyBroken) return 'needs-attention'
    if (!cfg.validated) return 'needs-revalidation'
    return 'ready'
  }
  // disabled
  return anyBroken ? 'disabled-incomplete' : 'disabled-valid'
}

/** Convenience: is this module live for runtime conversion right now? */
export function isConfigReady(moduleId: string): boolean {
  const cfg = getConversionConfig(moduleId)
  return !!cfg && configState(cfg) === 'ready'
}

/** Mapped / total counts for the readiness panel + list "Mapping readiness" cell. */
export function readinessCounts(cfg: ConversionConfig): { mappedRequired: number; totalRequired: number; mappedOptional: number; totalOptional: number } {
  const mod = getCrmModule(cfg.moduleId) ?? ({ fields: [] } as unknown as CrmModule)
  const props = moduleStores(cfg.moduleId).properties
  const fields = erpTargetFields(cfg.target)
  let mappedRequired = 0, totalRequired = 0, mappedOptional = 0, totalOptional = 0
  for (const f of fields) {
    const e = cfg.mappings.find((m) => m.targetKey === f.key) ?? { targetKey: f.key, strategy: 'unmapped' as SourceStrategy }
    const ok = evalEntry(e, f, mod, props).status === 'compatible'
    if (f.requirement === 'optional') { totalOptional++; if (ok) mappedOptional++ }
    else { totalRequired++; if (ok) mappedRequired++ }
  }
  return { mappedRequired, totalRequired, mappedOptional, totalOptional }
}

// ── Save / validate (PRD §Save, validate, preview, and apply) ─────────────────
export function validateConfig(moduleId: string): void {
  const cfg = getConversionConfig(moduleId)
  if (!cfg) return
  cfg.validated = true
  cfg.lastValidatedAt = new Date().toISOString()
  persistConversionConfigs()
}
export function saveConfig(moduleId: string, patch: Partial<ConversionConfig>, actor = 'You'): void {
  const cfg = ensureConversionConfig(moduleId)
  Object.assign(cfg, patch)
  cfg.revision += 1
  cfg.lastSavedBy = actor
  cfg.lastSavedAt = new Date().toISOString()
  // Any edit invalidates prior validation until re-validated.
  if (patch.mappings || patch.target || patch.criterion !== undefined) cfg.validated = false
  persistConversionConfigs()
}
export function setEnabled(moduleId: string, enabled: boolean, actor = 'You'): void {
  saveConfig(moduleId, { enabled }, actor)
}

/** Modules eligible to appear on the ERP Integration Settings list: only PUBLISHED
 *  modules (the system Deals module + any published custom module). A draft/incomplete
 *  module has no stable published schema to map against. */
export const eligibleModules = computed<CrmModule[]>(() =>
  crmModules.filter((m) => m.status === 'published'),
)

// ── Runtime conversion (PRD §Runtime action visibility / Confirmation / Result) ─
// A record is converted MANUALLY into exactly ONE ERP transaction, after a
// read-only review + explicit confirm. One success per record, ever (guarded by
// eligibility). This is the Deals path; custom modules reuse the same shape.
export interface ConvEligibility { ok: boolean; reason?: string }

/** Can this deal be converted right now? Also the runtime gate (checked again at
 *  confirm, so a stale UI can't bypass it). */
export function dealConvEligibility(d: Deal): ConvEligibility {
  const cfg = getConversionConfig('deals')
  if (!cfg || !cfg.enabled) return { ok: false, reason: 'ERP conversion is not enabled for Deals.' }
  if (configState(cfg) !== 'ready') return { ok: false, reason: 'The Deals conversion mapping is not ready.' }
  if (d.archived) return { ok: false, reason: 'Restore this deal before converting it.' }
  // Lost-stage limitation gate (PRD): runs BEFORE record-completeness checks.
  if (d.stage === 'Lost') return { ok: false, reason: 'Deals in the Lost stage cannot be converted.' }
  if (d.conversion === 'converted') return { ok: false, reason: 'This deal has already been converted.' }
  if (d.conversion === 'processing') return { ok: false, reason: 'A conversion is already in progress.' }
  if (!(d.products ?? []).length) return { ok: false, reason: 'Add at least one product before converting.' }
  return { ok: true }
}

export function dealTarget(): ConvTarget {
  return getConversionConfig('deals')?.target ?? 'sales-order'
}
export function dealTargetLabel(): string {
  return CONV_TARGET_LABEL[dealTarget()]
}

function nextNumber(arr: { number: number }[], base: number): number {
  return arr.reduce((mx, x) => Math.max(mx, x.number), base) + 1
}

export interface ConvResult { ok: boolean; error?: string; target?: ConvTarget; ref?: { id: string; number: number } }

/** Confirm the conversion: create exactly one ERP transaction and project the
 *  result onto the deal. Prototype resolves Processing → Converted immediately;
 *  the eligibility guard above is the exactly-once guarantee. */
export function runDealConversion(dealId: string): ConvResult {
  const d = getDeal(dealId)
  if (!d) return { ok: false, error: 'Deal not found.' }
  const elig = dealConvEligibility(d)
  if (!elig.ok) return { ok: false, error: elig.reason }
  const target = dealTarget()
  d.conversion = 'processing'
  d.conversionError = undefined
  persistCrmDeals()

  const today = new Date().toISOString().slice(0, 10)
  const totals = dealTotals(d)
  if (target === 'sales-order') {
    const number = nextNumber(salesOrders as { number: number }[], 10000)
    const items: SalesOrderItem[] = (d.products ?? []).map((li) => ({
      product: li.productName, sku: li.sku ?? '', description: li.description ?? '',
      unit: li.unit, unitPrice: li.originalPrice, qty: li.quantity,
      discountPct: li.discountType === 'percentage' ? (li.discount ?? 0) : 0, amount: lineSubtotal(li),
    }))
    const order: SalesOrder = {
      id: `so-${number}`, number, customer: { id: d.customerId, name: d.company },
      date: today, dueDate: d.expectedCloseDate || today, status: 'open',
      balanceDue: totals.total, total: totals.total, tags: d.tags ? [...d.tags] : undefined,
      items, globalDiscount: 0, shippingFee: d.shippingFee ?? 0,
    }
    salesOrders.push(order)
    d.conversion = 'converted'; d.convertedTarget = 'Sales Order'; d.salesOrderId = order.id; d.lastActivity = today
    persistCrmDeals()
    return { ok: true, target, ref: { id: order.id, number } }
  }
  const number = nextNumber(salesQuotes as { number: number }[], 20000)
  const quote: SalesQuote = {
    id: `sq-${number}`, number, customer: { id: d.customerId, name: d.company },
    date: today, expirationDate: d.expectedCloseDate || today, status: 'open',
    total: totals.total, tags: d.tags ? [...d.tags] : undefined,
  }
  salesQuotes.push(quote)
  d.conversion = 'converted'; d.convertedTarget = 'Sales Quote'; d.salesOrderId = quote.id; d.lastActivity = today
  persistCrmDeals()
  return { ok: true, target, ref: { id: quote.id, number } }
}

/** The ERP transaction a converted deal points to (for the "Open in ERP" link). */
export function dealErpTxn(d: Deal): { id: string; number: number; route: string; label: string } | undefined {
  if (d.conversion !== 'converted' || !d.salesOrderId) return undefined
  if (d.convertedTarget === 'Sales Quote') {
    const q = salesQuotes.find((x) => x.id === d.salesOrderId)
    return q ? { id: q.id, number: q.number, route: `/sales-quotes/${q.id}`, label: `Sales Quote #${q.number}` } : undefined
  }
  const o = salesOrders.find((x) => x.id === d.salesOrderId)
  return o ? { id: o.id, number: o.number, route: `/sales-orders/${o.id}`, label: `Sales Order #${o.number}` } : undefined
}
