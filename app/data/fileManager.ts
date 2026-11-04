import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { salesInvoices } from './salesInvoices'
import { salesOrders } from './salesOrders'
import { salesQuotes } from './salesQuotes'
import { salesDeliveries } from './salesDeliveries'
import { purchaseQuotes } from './purchaseQuotes'
import { purchaseDeliveries } from './purchaseDeliveries'
import { bills } from './bills'
import { creditMemos } from './creditMemos'
import { warehouseTransfers } from './warehouseTransfers'

/**
 * File manager (Other lists) — every file attached to a transaction anywhere in
 * the account, in one list.
 *
 * The modules keep their own attachments (bills carry `attachments`, review
 * files have their own store), but none of them records who uploaded a file or
 * what it was uploaded for. Rather than half-derive those from stores that do
 * not hold them, the index reads this list.
 */

export interface ManagedFile {
  id: string
  /** ISO timestamp — the list shows date, time and uploader on two lines. */
  uploadedAt: string
  uploadedBy: string
  /** Transaction this file hangs off, e.g. "Sales invoice #2026/01/22". Blank when none. */
  transactionNo: string
  /**
   * The page the file is attached to, e.g. "Sales invoice". Blank when the file
   * is not attached to anything yet — a file with no transaction number has no
   * page either, and the row offers to attach it instead.
   */
  page: string
  fileName: string
  /** Customer or vendor the transaction belongs to. Blank when none. */
  contact: string
}

const SEED_FILES: ManagedFile[] = [
  { id: 'FM001', uploadedAt: '2026-01-30T11:00', uploadedBy: 'Rizal Candra',   transactionNo: 'Expense #1001',                   page: 'Expense',             fileName: 'Expense_Template.xlsx',                   contact: 'Makmur Sentosa' },
  { id: 'FM002', uploadedAt: '2026-01-30T11:00', uploadedBy: 'Rizal Candra',   transactionNo: 'Sales invoice #2026/01/22',       page: 'Sales invoice',       fileName: 'Invoice_Cust1.png',                       contact: 'Astra' },
  { id: 'FM003', uploadedAt: '2026-01-30T11:00', uploadedBy: 'Rizal Candra',   transactionNo: 'Sales quote #2026/01/22',         page: 'Sales quote',         fileName: 'Req_Cust2.png',                           contact: 'Astra' },
  { id: 'FM004', uploadedAt: '2026-01-22T08:00', uploadedBy: 'Rizal Candra',   transactionNo: 'Sales order #2026/01/22',         page: 'Sales order',         fileName: 'Screenshot_2026-01-13_at_16.17.25.png',   contact: 'Astra' },
  { id: 'FM005', uploadedAt: '2026-01-19T13:30', uploadedBy: 'Fajar Nugraha',  transactionNo: 'Bank withdrawal #1592',           page: 'Bank withdrawal',     fileName: 'Bukti_Trf.png',                           contact: '' },
  { id: 'FM006', uploadedAt: '2026-01-15T13:30', uploadedBy: 'Fajar Nugraha',  transactionNo: '',                                page: '',                    fileName: 'KlikBCA_2026-01-23.png',                  contact: '' },
  { id: 'FM007', uploadedAt: '2026-01-12T16:45', uploadedBy: 'Fajar Nugraha',  transactionNo: '',                                page: '',                    fileName: 'KlikBCA_2026-01-23.png',                  contact: '' },
  { id: 'FM008', uploadedAt: '2026-01-05T17:15', uploadedBy: 'Evelyn Bellinda', transactionNo: '',                               page: '',                    fileName: 'KlikBCA_2026-01-23.png',                  contact: '' },
  { id: 'FM009', uploadedAt: '2026-01-01T09:15', uploadedBy: 'Evelyn Bellinda', transactionNo: 'Warehouse transfer #WH/26/11/01', page: 'Warehouse transfer',  fileName: 'WarehouseTrf2026.xlsx',                   contact: '' },
  { id: 'FM010', uploadedAt: '2026-01-01T10:00', uploadedBy: 'Evelyn Bellinda', transactionNo: 'Journal entry #455',             page: 'General journal',     fileName: 'JournalEntry26.pdf',                      contact: '' },
  { id: 'FM011', uploadedAt: '2026-01-01T10:00', uploadedBy: 'Evelyn Bellinda', transactionNo: 'Credit Memo #2026/01/22',        page: 'Credit memo',         fileName: 'Cust_A205.pdf',                           contact: 'Karya Beton' },
  { id: 'FM012', uploadedAt: '2026-01-01T10:00', uploadedBy: 'Evelyn Bellinda', transactionNo: 'Purchase delivery #2026/01/22',  page: 'Purchase delivery',   fileName: 'DeliveryItems.pdf',                       contact: 'Karya Beton' },
]

const K_FILES = 'file-manager-v1'

export const managedFiles = reactive<ManagedFile[]>(
  loadSnapshot<ManagedFile>(K_FILES) ?? [...SEED_FILES],
)

export function persistManagedFiles(): void {
  saveSnapshot(K_FILES, managedFiles)
}

let fileSeq = 0
export function addManagedFile(input: Omit<ManagedFile, 'id'>): ManagedFile {
  const file: ManagedFile = { ...input, id: `FM-NEW-${++fileSeq}-${Date.now()}` }
  managedFiles.unshift(file)
  persistManagedFiles()
  return file
}

export function removeManagedFile(id: string): boolean {
  const idx = managedFiles.findIndex(f => f.id === id)
  if (idx === -1) return false
  managedFiles.splice(idx, 1)
  persistManagedFiles()
  return true
}

/** The Page filter's options — every page present in the list, in order. */
export function filePages(): string[] {
  return [...new Set(managedFiles.map(f => f.page).filter(Boolean))]
}

/** Pixel icon name for a file, by extension — same mapping the upload fields use. */
export function fileIconName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'doc' || ext === 'docx') return 'word-document'
  if (ext === 'xls' || ext === 'xlsx') return 'excel-document'
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image-document'
  if (ext === 'zip') return 'zip'
  return 'doc'
}

// ── Where a file can be filed ───────────────────────────────────────────────
/**
 * The Add file drawer asks two things: which page a file belongs to, and —
 * when attaching to something that already exists — which transaction on that
 * page. This table answers both from the real module stores, so the drawer
 * never shows a transaction that isn't there.
 *
 * `newRoute` is only set for pages whose create form actually carries an
 * Attachment field; "Create a new transaction" offers exactly those, because
 * routing to a form with nowhere to put the file would drop it on the floor.
 */
export interface FilePageTarget {
  page: string
  /** Create-form route, when that form has an Attachment field. */
  newRoute?: string
  /** Existing transactions on that page, newest first. */
  list: () => { no: string; contact: string }[]
}

type Numbered = { number: number | string; customer?: { name: string }; vendor?: { name: string } }

/** `Sales invoice #40150` — the format the index already stores. */
function numbered(page: string, rows: readonly Numbered[]) {
  return rows.map(r => ({
    no: `${page} #${r.number}`,
    contact: r.customer?.name ?? r.vendor?.name ?? '',
  }))
}

export const FILE_PAGE_TARGETS: FilePageTarget[] = [
  { page: 'Sales invoice',    newRoute: '/sales-invoices/new',     list: () => numbered('Sales invoice', salesInvoices as unknown as Numbered[]) },
  { page: 'Sales order',      newRoute: '/sales-orders/new',       list: () => numbered('Sales order', salesOrders as unknown as Numbered[]) },
  { page: 'Sales quote',      newRoute: '/sales-quotes/new',       list: () => numbered('Sales quote', salesQuotes as unknown as Numbered[]) },
  { page: 'Sales delivery',   newRoute: '/sales-deliveries/new',   list: () => numbered('Sales delivery', salesDeliveries as unknown as Numbered[]) },
  { page: 'Purchase quote',   newRoute: '/purchase-quotes/new',    list: () => numbered('Purchase quote', purchaseQuotes as unknown as Numbered[]) },
  { page: 'Purchase delivery', newRoute: '/purchase-deliveries/new', list: () => numbered('Purchase delivery', purchaseDeliveries as unknown as Numbered[]) },
  // Attach-only: these forms have no Attachment field, so a file can be filed
  // against an existing one but not created alongside a new one.
  { page: 'Expense',          list: () => numbered('Expense', bills as unknown as Numbered[]) },
  { page: 'Credit memo',      list: () => numbered('Credit memo', creditMemos as unknown as Numbered[]) },
  { page: 'Warehouse transfer', list: () => warehouseTransfers.map(t => ({ no: String(t.number), contact: '' })) },
]

export function filePageTarget(page: string): FilePageTarget | undefined {
  return FILE_PAGE_TARGETS.find(t => t.page === page)
}

/** Pages offered by "Attach to an existing transaction". */
export function attachablePages(): string[] {
  return FILE_PAGE_TARGETS.map(t => t.page)
}

/** Pages offered by "Create a new transaction" — those whose form takes files. */
export function creatablePages(): string[] {
  return FILE_PAGE_TARGETS.filter(t => t.newRoute).map(t => t.page)
}
