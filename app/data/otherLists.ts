/**
 * Other lists — mock data for the five "Other lists" screens copied from prod:
 * Recurring transactions (quickbook /recurring_schedules), Activity log
 * (quickbook /audits), Export & import (jurnal-frontend-app /v3/import_group),
 * File manager (quickbook /attachments) and Cost recalculation
 * (jurnal-frontend-app /v3/company/calculation_on_background).
 *
 * Tenant: PT Central Perk Indonesia; contacts and users come from the existing
 * customers / vendors / users tables. Every list carries one worst-case row
 * (longest plausible name, a zero / empty record).
 */
import { reactive } from 'vue'

// ─── Transaction types (shared by Recurring transactions + File manager) ──────
export const OTHER_LIST_TRANSACTION_TYPES = [
  'Sales invoice', 'Sales order', 'Sales quote', 'Purchase invoice', 'Purchase order',
  'Expense', 'Bank deposit', 'Bank withdrawal', 'Bank transfer', 'Journal entry',
] as const
export type OtherListTransactionType = (typeof OTHER_LIST_TRANSACTION_TYPES)[number]

// ═══ Recurring transactions ═══════════════════════════════════════════════════
export type RecurringPeriod = 'day' | 'week' | 'month' | 'year'
export type RecurringEndType = 'never' | 'after' | 'on'

export interface RecurringLine {
  date: string                 // ISO
  transactionNo: string | null // null = the generated transaction was deleted
  contact: string
  status: string
  total: number
  tags: string[]
}

export interface RecurringSchedule {
  id: string
  name: string
  transactionType: OtherListTransactionType
  sourceNo: string
  repeatEvery: number
  period: RecurringPeriod
  endType: RecurringEndType
  occurrences: number | null
  endDate: string | null       // ISO
  startDate: string            // ISO
  nextDate: string | null      // ISO; null when the schedule has ended
  endOfMonth: boolean
  autoSendEmail: boolean
  /** Why an ended schedule stopped — shown under "Ends". */
  endedReason: 'ended' | 'fully-paid' | 'qty-insufficient' | null
  lines: RecurringLine[]
}

export const recurringSchedules = reactive<RecurringSchedule[]>([
  {
    id: 'RS001', name: 'Monthly roastery supply — Anomali Coffee', transactionType: 'Sales invoice', sourceNo: 'Sales Invoice #10021',
    repeatEvery: 1, period: 'month', endType: 'never', occurrences: null, endDate: null,
    startDate: '2026-01-05', nextDate: '2026-11-05', endOfMonth: false, autoSendEmail: true, endedReason: null,
    lines: [
      { date: '2026-10-05', transactionNo: 'Sales Invoice #10168', contact: 'Anomali Coffee', status: 'Open', total: 45_000_000, tags: ['Jakarta'] },
      { date: '2026-09-05', transactionNo: 'Sales Invoice #10131', contact: 'Anomali Coffee', status: 'Paid', total: 45_000_000, tags: ['Jakarta'] },
      { date: '2026-08-05', transactionNo: null, contact: 'Anomali Coffee', status: '', total: 0, tags: [] },
      { date: '2026-07-05', transactionNo: 'Sales Invoice #10077', contact: 'Anomali Coffee', status: 'Paid', total: 42_500_000, tags: ['Jakarta'] },
      { date: '2026-01-05', transactionNo: 'Sales Invoice #10021', contact: 'Anomali Coffee', status: 'Paid', total: 42_500_000, tags: ['Jakarta'] },
    ],
  },
  {
    id: 'RS002', name: 'Warehouse rent Gudang Jakarta Pusat', transactionType: 'Expense', sourceNo: 'Expense #00412',
    repeatEvery: 1, period: 'month', endType: 'after', occurrences: 12, endDate: null,
    startDate: '2026-01-31', nextDate: '2026-10-31', endOfMonth: true, autoSendEmail: false, endedReason: null,
    lines: [
      { date: '2026-09-30', transactionNo: 'Expense #00588', contact: 'Klasik Beans Cooperative', status: 'Paid', total: 18_500_000, tags: ['Rent'] },
      { date: '2026-08-31', transactionNo: 'Expense #00561', contact: 'Klasik Beans Cooperative', status: 'Paid', total: 18_500_000, tags: ['Rent'] },
    ],
  },
  {
    id: 'RS003', name: 'Weekly green beans order', transactionType: 'Purchase order', sourceNo: 'Purchase Order #20044',
    repeatEvery: 1, period: 'week', endType: 'on', occurrences: null, endDate: '2026-12-31',
    startDate: '2026-06-01', nextDate: '2026-10-12', endOfMonth: false, autoSendEmail: true, endedReason: null,
    lines: [
      { date: '2026-10-05', transactionNo: 'Purchase Order #20131', contact: 'Gayo Highland Exporters', status: 'Open', total: 27_600_000, tags: ['Green beans'] },
      { date: '2026-09-28', transactionNo: 'Purchase Order #20127', contact: 'Gayo Highland Exporters', status: 'Closed', total: 27_600_000, tags: ['Green beans'] },
    ],
  },
  {
    id: 'RS004', name: 'Quarterly grinder service contract', transactionType: 'Sales invoice', sourceNo: 'Sales Invoice #10035',
    repeatEvery: 3, period: 'month', endType: 'after', occurrences: 4, endDate: null,
    startDate: '2025-10-01', nextDate: null, endOfMonth: false, autoSendEmail: false, endedReason: 'ended',
    lines: [
      { date: '2026-07-01', transactionNo: 'Sales Invoice #10071', contact: 'Hotel Mulia Senayan', status: 'Paid', total: 9_750_000, tags: [] },
      { date: '2026-04-01', transactionNo: 'Sales Invoice #10052', contact: 'Hotel Mulia Senayan', status: 'Paid', total: 9_750_000, tags: [] },
    ],
  },
  {
    id: 'RS005', name: 'Office internet bill', transactionType: 'Bank withdrawal', sourceNo: 'Bank Withdrawal #30019',
    repeatEvery: 1, period: 'month', endType: 'never', occurrences: null, endDate: null,
    startDate: '2026-02-10', nextDate: null, endOfMonth: false, autoSendEmail: false, endedReason: 'fully-paid',
    lines: [
      { date: '2026-09-10', transactionNo: 'Bank Withdrawal #30087', contact: 'Sagaleh Coffee Supply', status: 'Paid', total: 1_250_000, tags: ['Utilities'] },
    ],
  },
  {
    id: 'RS006', name: 'Daily cold brew bottles for Fore Coffee Thamrin', transactionType: 'Sales order', sourceNo: 'Sales Order #40102',
    repeatEvery: 1, period: 'day', endType: 'never', occurrences: null, endDate: null,
    startDate: '2026-09-01', nextDate: null, endOfMonth: false, autoSendEmail: false, endedReason: 'qty-insufficient',
    lines: [
      { date: '2026-10-04', transactionNo: 'Sales Order #40188', contact: 'Fore Coffee Thamrin', status: 'Open', total: 3_200_000, tags: [] },
    ],
  },
  {
    id: 'RS007', name: 'Annual depreciation adjustment', transactionType: 'Journal entry', sourceNo: 'Journal Entry #50007',
    repeatEvery: 1, period: 'year', endType: 'never', occurrences: null, endDate: null,
    startDate: '2026-12-31', nextDate: '2026-12-31', endOfMonth: true, autoSendEmail: false, endedReason: null,
    lines: [],
  },
  {
    // Worst case: the longest name a user can type (60 chars), never run yet.
    id: 'RS008', name: 'Monthly consignment replenishment Tanamera Coffee Roastery 1', transactionType: 'Sales invoice', sourceNo: 'Sales Invoice #10199',
    repeatEvery: 2, period: 'week', endType: 'after', occurrences: 26, endDate: null,
    startDate: '2026-10-19', nextDate: '2026-10-19', endOfMonth: false, autoSendEmail: true, endedReason: null,
    lines: [],
  },
])

export function getRecurringSchedule(id: string): RecurringSchedule | undefined {
  return recurringSchedules.find((r) => r.id === id)
}
export function updateRecurringSchedule(id: string, patch: Partial<RecurringSchedule>) {
  const r = getRecurringSchedule(id)
  if (r) Object.assign(r, patch)
}
export function deleteRecurringSchedule(id: string) {
  const i = recurringSchedules.findIndex((r) => r.id === id)
  if (i >= 0) recurringSchedules.splice(i, 1)
}

// ═══ Activity log (prod: Audit list) ══════════════════════════════════════════
export interface AuditEntry {
  id: string
  date: string        // ISO datetime, GMT+7
  action: 'Create' | 'Update' | 'Delete' | 'Approve' | 'Void'
  type: string
  number: string
  deleted: boolean
  user: string
  changes: string[]
}

export const auditEntries: AuditEntry[] = [
  { id: 'AU01', date: '2026-10-05T09:42:00', action: 'Create', type: 'Sales Invoice', number: '10168', deleted: false, user: 'Rizal Candra', changes: ['Created Sales Invoice #10168 for Anomali Coffee', 'Total: Rp45.000.000'] },
  { id: 'AU02', date: '2026-10-05T09:15:00', action: 'Update', type: 'Purchase Order', number: '20131', deleted: false, user: 'Budi Santoso', changes: ['Due date: 12/10/2026 → 19/10/2026', 'Memo: (empty) → Split delivery'] },
  { id: 'AU03', date: '2026-10-04T16:08:00', action: 'Approve', type: 'Expense', number: '00588', deleted: false, user: 'Dewi Rahayu', changes: ['Status: Awaiting approval → Approved'] },
  { id: 'AU04', date: '2026-10-04T14:30:00', action: 'Delete', type: 'Sales Invoice', number: '10142', deleted: true, user: 'Rizal Candra', changes: ['Deleted Sales Invoice #10142'] },
  { id: 'AU05', date: '2026-10-04T11:02:00', action: 'Update', type: 'Product', number: 'GB-ARB-001', deleted: false, user: 'Sari Indah', changes: ['Sell price: Rp185.000 → Rp192.500', 'Buy price: Rp150.000 → Rp154.000', 'Minimum stock: 50 → 80'] },
  { id: 'AU06', date: '2026-10-03T10:21:00', action: 'Create', type: 'Bank Transfer', number: '30091', deleted: false, user: 'Hendra Wijaya', changes: ['Transfer from Bank BCA to Kas Kecil', 'Amount: Rp5.000.000'] },
  { id: 'AU07', date: '2026-10-02T17:45:00', action: 'Void', type: 'Sales Order', number: '40177', deleted: false, user: 'Andi Kusuma', changes: ['Status: Open → Void'] },
  { id: 'AU08', date: '2026-10-02T08:59:00', action: 'Create', type: 'Journal Entry', number: '50021', deleted: false, user: 'Ratna Sari', changes: ['Debit: Beban Penyusutan Rp12.400.000', 'Credit: Akumulasi Penyusutan Rp12.400.000'] },
  { id: 'AU09', date: '2026-10-01T13:12:00', action: 'Update', type: 'Contact', number: 'CUST-003', deleted: false, user: 'Farhan Nugroho', changes: ['Billing address: Jl. Asia Afrika No. 8, Senayan, Jakarta Pusat 10270 → Jl. Asia Afrika No. 8, Gelora, Tanah Abang, Jakarta Pusat, DKI Jakarta 10270, Indonesia'] },
  { id: 'AU10', date: '2026-09-30T15:40:00', action: 'Create', type: 'Warehouse Transfer', number: '60014', deleted: false, user: 'Budi Santoso', changes: ['From Gudang Jakarta Pusat to Gudang Bandung Selatan', '12 products'] },
  { id: 'AU11', date: '2026-09-29T09:05:00', action: 'Approve', type: 'Purchase Invoice', number: '20118', deleted: false, user: 'Dewi Rahayu', changes: ['Transaction not match with any approval rules. Transaction status is now approved'] },
  { id: 'AU12', date: '2026-09-28T11:33:00', action: 'Update', type: 'Sales Invoice', number: '10131', deleted: false, user: 'Lestari Putri', changes: [] },
]

// ═══ Export & import ══════════════════════════════════════════════════════════
export type ImportStatus = 'ok' | 'pending_delete' | 'queue' | 'processing' | 'failed' | 'failed_to_delete' | 'partial_ok'
export type ExportStatus = 'queued' | 'working' | 'complete' | 'failed' | 'email_failed'

export interface ImportLine {
  importStatus: 'Success' | 'Failed'
  number: string
  date: string
  contact: string
  dueDate: string
  status: string
  balanceDue: number
  total: number
  tags: string[]
}
export interface ProductImportLine {
  code: string
  name: string
  buyPrice: number
  sellPrice: number
  trackInventory: boolean
  category: string
}

export interface ImportFile {
  id: string
  createdAt: string    // ISO datetime
  status: ImportStatus
  fileName: string
  feature: string      // display label (prod `label.<import_type>`)
  kind: 'transaction' | 'product' | 'contact'
  passedRows: number
  totalRows: number
  ableToDestroy: boolean
  lines: ImportLine[]
  productLines: ProductImportLine[]
}

export interface ExportFile {
  id: string
  createdAt: string
  status: ExportStatus
  feature: string
  period: string
}

export const IMPORT_FEATURES = [
  'Sales invoice', 'Product', 'Purchase invoice', 'Expenses', 'Customer', 'Vendor', 'Account',
  'General journal', 'Bank statement', 'Warehouse', 'Sales order', 'Sales quote', 'Purchase order',
  'Purchase quote', 'Asset', 'Receive payment', 'Purchase payment', 'Stock adjustment', 'Product bundle',
  'Contact', 'Warehouse transfers', 'Update product',
]
export const EXPORT_FEATURES = [
  'Journal', 'Customer balance', 'Expense list', 'Vendor balance', 'Sales list', 'Purchases list',
  'Warehouse items stock movement summary', 'Account transaction', 'Executive summary', 'Fixed asset details',
  'Product export', 'Contact export', 'Sales by customer', 'Warehouse items valuation', 'Balance sheet',
  'Stock adjustment', 'Product profit',
]

export const importFiles = reactive<ImportFile[]>([
  {
    id: 'IM001', createdAt: '2026-10-05T10:12:00', status: 'ok', fileName: 'sales_invoice_october_week1.xlsx', feature: 'Sales invoice',
    kind: 'transaction', passedRows: 4, totalRows: 4, ableToDestroy: true, productLines: [],
    lines: [
      { importStatus: 'Success', number: 'Sales Invoice #10161', date: '2026-10-01', contact: 'Anomali Coffee', dueDate: '2026-10-31', status: 'Open', balanceDue: 12_500_000, total: 12_500_000, tags: ['Jakarta'] },
      { importStatus: 'Success', number: 'Sales Invoice #10162', date: '2026-10-01', contact: 'Tanamera Coffee Roastery', dueDate: '2026-10-31', status: 'Open', balanceDue: 8_750_000, total: 8_750_000, tags: [] },
      { importStatus: 'Success', number: 'Sales Invoice #10163', date: '2026-10-02', contact: 'Hotel Mulia Senayan', dueDate: '2026-11-01', status: 'Paid', balanceDue: 0, total: 21_000_000, tags: ['Hotel'] },
      { importStatus: 'Success', number: 'Sales Invoice #10164', date: '2026-10-03', contact: 'Djournal Coffee', dueDate: '2026-11-02', status: 'Open', balanceDue: 4_300_000, total: 4_300_000, tags: [] },
    ],
  },
  {
    id: 'IM002', createdAt: '2026-10-04T15:47:00', status: 'partial_ok', fileName: 'product_master_green_beans.xlsx', feature: 'Product',
    kind: 'product', passedRows: 3, totalRows: 5, ableToDestroy: true, lines: [],
    productLines: [
      { code: 'GB-ARB-001', name: 'Green Beans Arabica Gayo Grade 1', buyPrice: 154_000, sellPrice: 192_500, trackInventory: true, category: 'Green beans' },
      { code: 'GB-ROB-002', name: 'Green Beans Robusta Lampung', buyPrice: 82_000, sellPrice: 105_000, trackInventory: true, category: 'Green beans' },
      { code: 'SV-CLN-001', name: 'Espresso Machine Cleaning Service', buyPrice: 0, sellPrice: 350_000, trackInventory: false, category: 'Services' },
    ],
  },
  { id: 'IM003', createdAt: '2026-10-04T09:03:00', status: 'processing', fileName: 'purchase_invoice_september.csv', feature: 'Purchase invoice', kind: 'transaction', passedRows: 0, totalRows: 120, ableToDestroy: false, lines: [], productLines: [] },
  { id: 'IM004', createdAt: '2026-10-03T18:22:00', status: 'queue', fileName: 'customer_list_q4.xlsx', feature: 'Customer', kind: 'contact', passedRows: 0, totalRows: 48, ableToDestroy: false, lines: [], productLines: [] },
  {
    id: 'IM005', createdAt: '2026-10-02T11:40:00', status: 'failed', fileName: 'expenses_import_wrong_template.xlsx', feature: 'Expenses',
    kind: 'transaction', passedRows: 0, totalRows: 16, ableToDestroy: true, lines: [], productLines: [],
  },
  { id: 'IM006', createdAt: '2026-09-30T08:15:00', status: 'pending_delete', fileName: 'general_journal_opening.xlsx', feature: 'General journal', kind: 'transaction', passedRows: 32, totalRows: 32, ableToDestroy: false, lines: [], productLines: [] },
  { id: 'IM007', createdAt: '2026-09-28T13:55:00', status: 'failed_to_delete', fileName: 'warehouse_list.xlsx', feature: 'Warehouse', kind: 'contact', passedRows: 6, totalRows: 6, ableToDestroy: true, lines: [], productLines: [] },
  {
    // Worst case: a long file name and an empty sheet (0 of 0).
    id: 'IM008', createdAt: '2026-09-25T16:30:00', status: 'ok',
    fileName: 'import_sales_order_PT_Central_Perk_Indonesia_all_branches_september_2026_final_revised_v3.xlsx', feature: 'Sales order',
    kind: 'transaction', passedRows: 0, totalRows: 0, ableToDestroy: true, lines: [], productLines: [],
  },
])

export const exportFiles = reactive<ExportFile[]>([
  { id: 'EX001', createdAt: '2026-10-05T08:30:00', status: 'complete', feature: 'Balance sheet', period: '01/09/2026 - 30/09/2026' },
  { id: 'EX002', createdAt: '2026-10-04T17:02:00', status: 'working', feature: 'Journal', period: '01/01/2026 - 30/09/2026' },
  { id: 'EX003', createdAt: '2026-10-04T10:45:00', status: 'queued', feature: 'Sales list', period: '01/09/2026 - 30/09/2026' },
  { id: 'EX004', createdAt: '2026-10-03T14:20:00', status: 'email_failed', feature: 'Warehouse items stock movement summary', period: '01/07/2026 - 30/09/2026' },
  { id: 'EX005', createdAt: '2026-10-01T09:10:00', status: 'failed', feature: 'Product export', period: '-' },
  { id: 'EX006', createdAt: '2026-09-30T16:44:00', status: 'complete', feature: 'Executive summary', period: '01/09/2026 - 30/09/2026' },
])

export function getImportFile(id: string): ImportFile | undefined {
  return importFiles.find((f) => f.id === id)
}
export function deleteImportFile(id: string) {
  const i = importFiles.findIndex((f) => f.id === id)
  if (i >= 0) importFiles.splice(i, 1)
}

// ═══ File manager (prod: File Attachments) ════════════════════════════════════
export interface FileAttachment {
  id: string
  fileName: string
  transaction: string | null   // e.g. "Sales Invoice #10021"; null = unassigned
  transactionType: OtherListTransactionType | null
  createdAt: string            // ISO
}

export const fileAttachments = reactive<FileAttachment[]>([
  { id: 'FA001', fileName: 'invoice_anomali_oct.pdf', transaction: 'Sales Invoice #10168', transactionType: 'Sales invoice', createdAt: '2026-10-05' },
  { id: 'FA002', fileName: 'receipt_rent_gudang_jakarta.jpg', transaction: 'Expense #00588', transactionType: 'Expense', createdAt: '2026-10-04' },
  { id: 'FA003', fileName: 'po_gayo_highland_signed.pdf', transaction: 'Purchase Order #20131', transactionType: 'Purchase order', createdAt: '2026-10-03' },
  { id: 'FA004', fileName: 'bank_transfer_proof_0930.png', transaction: null, transactionType: 'Bank transfer', createdAt: '2026-09-30' },
  { id: 'FA005', fileName: 'supplier_invoice_klasik_beans.pdf', transaction: null, transactionType: 'Purchase invoice', createdAt: '2026-09-29' },
  { id: 'FA006', fileName: 'delivery_note_hotel_mulia.pdf', transaction: 'Sales Invoice #10163', transactionType: 'Sales invoice', createdAt: '2026-09-27' },
  { id: 'FA007', fileName: 'scan_0021.jpeg', transaction: null, transactionType: null, createdAt: '2026-09-25' },
  // Worst case: long file name, no transaction and no type.
  { id: 'FA008', fileName: 'tax_invoice_faktur_pajak_PT_Central_Perk_Indonesia_september_2026_batch_2_revised.pdf', transaction: null, transactionType: null, createdAt: '2026-09-21' },
])

/** Transactions an attachment can be assigned to (prod: select2 transaction search). */
export const ASSIGNABLE_TRANSACTIONS = [
  'Sales Invoice #10161', 'Sales Invoice #10162', 'Sales Invoice #10164', 'Purchase Invoice #20118',
  'Expense #00561', 'Bank Transfer #30091', 'Journal Entry #50021',
]

// ═══ Cost recalculation (prod: Inventory value recalculation) ═════════════════
export type RecalcStatus = 'idle' | 'progress' | 'done' | 'fail'
export interface RecalcLog {
  id: string
  recalculateDate: string | null       // ISO datetime; null while awaiting
  auto: boolean
  by: { name: string; email: string } | null
  trigger: string | null               // null = the triggering transaction was deleted
  triggerDate: string                  // ISO
  status: RecalcStatus
}

export const recalcState = reactive({
  scheduleActive: true,
  scheduleTime: '01:00',
  logs: [
    { id: 'RC07', recalculateDate: null, auto: false, by: null, trigger: 'Stock Adjustment #70033', triggerDate: '2026-10-03', status: 'idle' },
    { id: 'RC06', recalculateDate: '2026-10-02T01:00:00', auto: true, by: null, trigger: 'Purchase Invoice #20118', triggerDate: '2026-09-29', status: 'done' },
    { id: 'RC05', recalculateDate: '2026-09-27T14:22:00', auto: false, by: { name: 'Rizal Candra', email: 'rizal.candra@centralperk.co.id' }, trigger: 'Warehouse Transfer #60014', triggerDate: '2026-09-26', status: 'done' },
    { id: 'RC04', recalculateDate: '2026-09-20T01:00:00', auto: true, by: null, trigger: 'Sales Invoice #10131', triggerDate: '2026-09-05', status: 'fail' },
    { id: 'RC03', recalculateDate: '2026-09-12T09:48:00', auto: false, by: { name: 'Muhammad Farhan Nugroho Wicaksono Putra', email: 'muhammad.farhan.nugroho.wicaksono@centralperk.co.id' }, trigger: null, triggerDate: '2026-09-11', status: 'done' },
    { id: 'RC02', recalculateDate: '2026-09-01T01:00:00', auto: true, by: null, trigger: 'Purchase Invoice #20087', triggerDate: '2026-08-30', status: 'done' },
  ] as RecalcLog[],
})
