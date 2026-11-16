/**
 * Company settings — Billing, Sales (form setting + invoice reminder), Purchase
 * and Default accounts (account mapping). Mirrors the company setting tabs of
 * the accounting app. Edits persist to localStorage via the save* helpers.
 */
import { DEFAULT_COA, type CoaAccount } from './wmsCutover'

const PREFIX = 'erp-db:company-settings:'

function load<T>(key: string, defaults: T): T {
  if (!import.meta.client) return structuredClone(defaults)
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? { ...structuredClone(defaults), ...JSON.parse(raw) } : structuredClone(defaults)
  } catch {
    return structuredClone(defaults)
  }
}
function save<T>(key: string, v: T): void {
  if (!import.meta.client) return
  try { localStorage.setItem(PREFIX + key, JSON.stringify(v)) } catch { /* non-fatal */ }
}

// ── Shared ───────────────────────────────────────────────────────────────────

export const COMPANY_NAME = 'PT Central Perk Indonesia'

/** Payment terms offered by "Preferred invoice term" / "Preferred purchase term". */
export const TERM_OPTIONS = [
  'Cash on Delivery', 'Net 15', 'Net 30', 'Net 60', 'Custom',
]

// ── Billing ──────────────────────────────────────────────────────────────────

export interface BillingHistoryRow {
  id: string
  /** ISO date; null while unpaid (renders "-"). */
  paidDate: string | null
  periodStart: string
  periodEnd: string
  amount: number
  /** null when the invoice document has not been issued yet. */
  invoiceId: string | null
}

export const billingSummary = {
  status: 'Active' as 'Active' | 'Expired',
  packageName: 'Enterprise',
  usersUsed: 12,
  usersTotal: 15,
  partners: 0,
  daysLeft: 27,
  expiryDate: '31/10/2026',
  billingCycle: '1 Month',
  nextBillingDate: '01/11/2026',
  recurringActive: true,
}

export const billingHistory: BillingHistoryRow[] = [
  { id: 'BH-2026-10', paidDate: null,         periodStart: '2026-10-01', periodEnd: '2026-10-31', amount: 0,          invoiceId: null },
  { id: 'BH-2026-09', paidDate: '2026-09-01', periodStart: '2026-09-01', periodEnd: '2026-09-30', amount: 3_330_000,  invoiceId: 'INV-BIL-20260901' },
  { id: 'BH-2026-08', paidDate: '2026-08-01', periodStart: '2026-08-01', periodEnd: '2026-08-31', amount: 3_330_000,  invoiceId: 'INV-BIL-20260801' },
  { id: 'BH-2026-07', paidDate: '2026-07-01', periodStart: '2026-07-01', periodEnd: '2026-07-31', amount: 3_330_000,  invoiceId: 'INV-BIL-20260701' },
  { id: 'BH-2026-06', paidDate: '2026-06-02', periodStart: '2026-06-01', periodEnd: '2026-06-30', amount: 3_108_000,  invoiceId: 'INV-BIL-20260602' },
  { id: 'BH-2026-05', paidDate: '2026-05-01', periodStart: '2026-05-01', periodEnd: '2026-05-31', amount: 3_108_000,  invoiceId: 'INV-BIL-20260501' },
  { id: 'BH-2026-04', paidDate: '2026-04-01', periodStart: '2026-04-01', periodEnd: '2026-04-30', amount: 3_108_000,  invoiceId: 'INV-BIL-20260401' },
  { id: 'BH-2026-03', paidDate: '2026-03-03', periodStart: '2026-03-01', periodEnd: '2026-03-31', amount: 3_108_000,  invoiceId: 'INV-BIL-20260303' },
  { id: 'BH-2026-02', paidDate: '2026-02-01', periodStart: '2026-02-01', periodEnd: '2026-02-28', amount: 2_664_000,  invoiceId: 'INV-BIL-20260201' },
  { id: 'BH-2026-01', paidDate: '2026-01-01', periodStart: '2026-01-01', periodEnd: '2026-01-31', amount: 2_664_000,  invoiceId: 'INV-BIL-20260101' },
  { id: 'BH-2025-12', paidDate: '2025-12-01', periodStart: '2025-12-01', periodEnd: '2025-12-31', amount: 2_664_000,  invoiceId: 'INV-BIL-20251201' },
  { id: 'BH-2025-01', paidDate: '2025-01-02', periodStart: '2025-01-01', periodEnd: '2025-12-31', amount: 29_970_000, invoiceId: 'INV-BIL-20250102' },
]

// ── Sales › Form setting ─────────────────────────────────────────────────────

export interface SalesFormSettings {
  preferredInvoiceTerm: string
  shipping: boolean
  discount: boolean
  discountLines: boolean
  /** One-way switch: once saved on, it cannot be turned off again. */
  accountDiscountMapping: boolean
  deposit: boolean
  showProfitMargin: boolean
  disableSellOnNoProduct: boolean
  pricingRuleLock: boolean
  defaultInvoiceMessage: string
  defaultDeliverySlipMessage: string
}

const SALES_DEFAULTS: SalesFormSettings = {
  preferredInvoiceTerm: 'Net 30',
  shipping: true,
  discount: true,
  discountLines: true,
  accountDiscountMapping: false,
  deposit: true,
  showProfitMargin: false,
  disableSellOnNoProduct: false,
  pricingRuleLock: false,
  defaultInvoiceMessage: 'Thank you for your business. Please transfer the payment to BCA 123-456-7890 a/n PT Central Perk Indonesia and include the invoice number in the transfer note.',
  defaultDeliverySlipMessage: '',
}

export function getSalesFormSettings(): SalesFormSettings { return load('sales', SALES_DEFAULTS) }
export function saveSalesFormSettings(v: SalesFormSettings): void { save('sales', v) }

// ── Sales › Invoice reminder ─────────────────────────────────────────────────

export type ReminderType = 'invoice' | 'order' | 'both'

export const REMINDER_TYPE_OPTIONS: { value: ReminderType; label: string }[] = [
  { value: 'invoice', label: 'Sales invoice' },
  { value: 'order',   label: 'Sales order' },
  { value: 'both',    label: 'Both' },
]

/** Placeholders the email template accepts, in the order the server lists them. */
export const EMAIL_TEMPLATE_PLACEHOLDERS = [
  'NomorTransaksi', 'NamaPerusahaan', 'TanggalTransaksi',
  'SisaTagihan', 'EmailPerusahaan', 'PerusahaanPelanggan',
  'NamaPelanggan', 'TanggalHariIni', 'TanggalJatuhTempo',
]

export const DEFAULT_REMINDER_HEADER = '[NamaPerusahaan] - Transaction [NomorTransaksi] is due on [TanggalJatuhTempo]'
export const DEFAULT_REMINDER_BODY = 'Dear [NamaPelanggan],\n\nWe would like to kindly remind you that your invoice due on [TanggalJatuhTempo] is still outstanding. Please make your payment as soon as possible.\n\nIf you have paid for the invoice, please ignore this email. If you have any question please contact us at [EmailPerusahaan].\n\nRegards\n[NamaPerusahaan]'

export interface ReminderInterval {
  id: string
  /** Negative = before the due date, 0 = on the day, positive = after. */
  days: number
  includePdf: boolean
  headerEmail: string
  bodyEmail: string
}

export const MAX_REMINDER_INTERVALS = 5

export interface InvoiceReminderSettings {
  isEnabled: boolean
  reminderType: ReminderType
  intervals: ReminderInterval[]
  sendCopy: boolean
  offAmount: boolean
  amountUnder: number
  offCustomer: boolean
  excludedCustomerIds: string[]
  offInvoice: boolean
  excludedInvoiceIds: string[]
  offOrder: boolean
  excludedOrderIds: string[]
}

const REMINDER_DEFAULTS: InvoiceReminderSettings = {
  isEnabled: true,
  reminderType: 'invoice',
  intervals: [
    { id: 'ri-1', days: -3, includePdf: true,  headerEmail: DEFAULT_REMINDER_HEADER, bodyEmail: DEFAULT_REMINDER_BODY },
    { id: 'ri-2', days: 0,  includePdf: true,  headerEmail: DEFAULT_REMINDER_HEADER, bodyEmail: DEFAULT_REMINDER_BODY },
    { id: 'ri-3', days: 7,  includePdf: false, headerEmail: DEFAULT_REMINDER_HEADER, bodyEmail: DEFAULT_REMINDER_BODY },
  ],
  sendCopy: true,
  offAmount: true,
  amountUnder: 50_000,
  offCustomer: false,
  excludedCustomerIds: [],
  offInvoice: false,
  excludedInvoiceIds: [],
  offOrder: false,
  excludedOrderIds: [],
}

export function getInvoiceReminderSettings(): InvoiceReminderSettings { return load('invoice-reminder', REMINDER_DEFAULTS) }
export function saveInvoiceReminderSettings(v: InvoiceReminderSettings): void { save('invoice-reminder', v) }

// ── Purchase ─────────────────────────────────────────────────────────────────

export interface PurchaseSettings {
  preferredPurchaseTerm: string
  purchaseRequestSupplier: boolean
  shipping: boolean
  discount: boolean
  discountLines: boolean
  deposit: boolean
  defaultPurchaseMessage: string
}

const PURCHASE_DEFAULTS: PurchaseSettings = {
  preferredPurchaseTerm: 'Net 30',
  purchaseRequestSupplier: false,
  shipping: true,
  discount: true,
  discountLines: false,
  deposit: true,
  defaultPurchaseMessage: '',
}

export function getPurchaseSettings(): PurchaseSettings { return load('purchase', PURCHASE_DEFAULTS) }
export function savePurchaseSettings(v: PurchaseSettings): void { save('purchase', v) }

// ── Default accounts (account mapping) ───────────────────────────────────────

/** Accounts beyond the shared default chart that the mapping offers (multi-currency, adjustments). */
const EXTRA_COA: CoaAccount[] = [
  { code: '7-70099', name: 'Other Income' },
  { code: '8-80000', name: 'Interest Expense' },
  { code: '8-80100', name: 'Inventory Adjustments' },
  { code: '8-80999', name: 'Other Miscellaneous Expense' },
  { code: '8-80998', name: 'Unrealised Gain/Loss on Foreign Exchange Revaluation of Receivables and Payables' },
]

export const MAPPING_COA: CoaAccount[] = [...DEFAULT_COA, ...EXTRA_COA.filter(e => !DEFAULT_COA.some(d => d.code === e.code))]

type AccountPool = (a: CoaAccount) => boolean
const starts = (...prefixes: string[]): AccountPool => (a) => prefixes.some(p => a.code.startsWith(p))

export interface MappingField {
  key: string
  label: string
  tooltip: string
  /** Which accounts the dropdown offers. */
  pool: AccountPool
  /** When set, the account cannot be changed and this reason shows under the field. */
  lockedReason?: string
}

export interface MappingGroup {
  key: string
  label: string
  /** Rendered as two columns, left then right, as on the server form. */
  left: MappingField[]
  right: MappingField[]
}

const USED_IN_TX = 'Cannot be changed: this account has been used in transactions'
const USED_IN_TAX = 'Cannot be changed: this account is referenced by active tax settings'
const USED_IN_OB = 'Cannot be changed: opening balance has already been recorded for this company'

export const MAPPING_GROUPS: MappingGroup[] = [
  {
    key: 'sales', label: 'Sales',
    left: [
      { key: 'salesRevenue', label: 'Sales revenue', tooltip: 'Used to accumulate your sales of product and will be pre-selected when you create product', pool: starts('4-'), lockedReason: USED_IN_TX },
      { key: 'salesDiscount', label: 'Sales discount', tooltip: 'Accumulate total discount from your sales transactions', pool: starts('4-') },
      { key: 'salesReturn', label: 'Sales return', tooltip: 'Accumulate total amount from your sales return transactions', pool: starts('4-') },
      { key: 'salesShipping', label: 'Sales shipping', tooltip: 'Accumulate total shipping income from your sales transactions', pool: starts('4-', '7-') },
    ],
    right: [
      { key: 'unearnedRevenue', label: 'Unearned revenue', tooltip: 'Accumulate amount paid in advance from your sales order transactions', pool: starts('2-202', '2-203', '2-206') },
      { key: 'unbilledSales', label: 'Unbilled sales', tooltip: 'Accumulate unbilled sales amount from your sales delivery transaction', pool: starts('4-') },
      { key: 'unbilledReceivable', label: 'Unbilled receivable', tooltip: 'Accumulate unbilled receivable amount from your sales delivery transaction', pool: starts('1-101') },
      { key: 'salesTaxPayable', label: 'Sales tax payable', tooltip: 'This account will be pre-selected when you create new tax (for sales)', pool: starts('2-205'), lockedReason: USED_IN_TAX },
    ],
  },
  {
    key: 'purchase', label: 'Purchase',
    left: [
      { key: 'purchaseCogs', label: 'Purchase (COGS)', tooltip: 'Used to accumulate your cost of sales and will be pre-selected when you create product', pool: starts('5-'), lockedReason: USED_IN_TX },
      { key: 'purchaseShipping', label: 'Purchase shipping', tooltip: 'Accumulate total shipping cost from your purchase transactions', pool: starts('5-', '6-') },
      { key: 'prepayment', label: 'Prepayment', tooltip: 'Accumulate amount received in advance from your purchase order transactions', pool: starts('1-104') },
    ],
    right: [
      { key: 'unbilledPayable', label: 'Unbilled payable', tooltip: 'Accumulate unbilled payables amount from your purchase delivery transaction', pool: starts('2-201') },
      { key: 'purchaseTaxReceivable', label: 'Purchase tax receivable', tooltip: 'This account will be pre-selected when you create new tax (for purchase)', pool: starts('1-105'), lockedReason: USED_IN_TAX },
    ],
  },
  {
    key: 'arap', label: 'AR/AP',
    left: [
      { key: 'accountReceivable', label: 'Account receivable', tooltip: 'This account will be pre-selected when you create new contact', pool: starts('1-101', '1-103'), lockedReason: USED_IN_TX },
    ],
    right: [
      { key: 'accountPayable', label: 'Account payable', tooltip: 'This account will be pre-selected when you create new contact', pool: starts('2-201', '2-202'), lockedReason: USED_IN_TX },
    ],
  },
  {
    key: 'inventory', label: 'Inventory',
    left: [
      { key: 'inventory', label: 'Inventory', tooltip: 'Used to accumulate your inventory balance and will be pre-selected when you create product', pool: starts('1-102'), lockedReason: USED_IN_TX },
      { key: 'inventoryGeneral', label: 'Inventory general', tooltip: 'This account will be pre-selected when you create stock adjustment with type general', pool: starts('5-', '8-') },
    ],
    right: [
      { key: 'inventoryWaste', label: 'Inventory waste', tooltip: 'This account will be pre-selected when you create stock adjustment with type waste', pool: starts('5-', '8-') },
      { key: 'inventoryProduction', label: 'Inventory production', tooltip: 'This account will be pre-selected when you create stock adjustment with type production', pool: starts('5-', '8-') },
    ],
  },
  {
    key: 'others', label: 'Others',
    left: [
      { key: 'openingBalanceEquity', label: 'Opening balance equity', tooltip: "This equity account will be used as a temporary account if you're unsure to categorize your balances", pool: starts('3-'), lockedReason: USED_IN_OB },
    ],
    right: [
      { key: 'fixedAsset', label: 'Fixed asset', tooltip: 'This account will be pre-selected when you record a fixed asset, however you can still change it for each asset', pool: starts('1-107') },
    ],
  },
  {
    key: 'multiCurrency', label: 'Multi-currency',
    left: [
      { key: 'bankRevaluation', label: 'Bank revaluation', tooltip: 'Accumulate balance of revaluation from non-base cash & bank account due to difference in currency rate', pool: starts('7-', '8-') },
      { key: 'realisedGainLoss', label: 'Realised gain/loss', tooltip: 'Accumulate balance of gain/loss from payment of receivable/payables due to difference in currency rate', pool: starts('7-', '8-') },
    ],
    right: [
      { key: 'unrealisedGainLoss', label: 'Unrealised gain/loss', tooltip: 'Accumulate temporary balance of gain/loss from payment of receivable/payables due to difference in currency rate', pool: starts('7-', '8-') },
    ],
  },
]

/** Account code per mapping field. */
export type AccountMapping = Record<string, string>

const MAPPING_DEFAULTS: AccountMapping = {
  salesRevenue: '4-40000',
  salesDiscount: '4-40100',
  salesReturn: '4-40200',
  salesShipping: '4-40000',
  unearnedRevenue: '2-20203',
  unbilledSales: '4-40201',
  unbilledReceivable: '1-10101',
  salesTaxPayable: '2-20500',
  purchaseCogs: '5-50000',
  purchaseShipping: '5-50300',
  prepayment: '1-10403',
  unbilledPayable: '2-20101',
  purchaseTaxReceivable: '1-10500',
  accountReceivable: '1-10100',
  accountPayable: '2-20100',
  inventory: '1-10200',
  inventoryGeneral: '8-80100',
  inventoryWaste: '8-80100',
  inventoryProduction: '5-50500',
  openingBalanceEquity: '3-30999',
  fixedAsset: '1-10705',
  bankRevaluation: '8-80998',
  realisedGainLoss: '8-80998',
  unrealisedGainLoss: '8-80998',
}

export function getAccountMapping(): AccountMapping { return load('account-mapping', MAPPING_DEFAULTS) }
export function saveAccountMapping(v: AccountMapping): void { save('account-mapping', v) }

export function mappingOptions(field: MappingField): { value: string; label: string }[] {
  return MAPPING_COA.filter(field.pool).map(a => ({ value: a.code, label: `(${a.code}) ${a.name}` }))
}
export function mappingAccountLabel(code: string): string {
  const a = MAPPING_COA.find(x => x.code === code)
  return a ? `(${a.code}) ${a.name}` : '—'
}
