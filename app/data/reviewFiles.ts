import { reactive } from 'vue'
import type { ReviewFile, FileClassification } from './types'
import { VENDORS } from './master'

export const reviewFiles = reactive<ReviewFile[]>([
  { id: 'RF001', file: 'invoice_scan_001.pdf',  number: 'INV/VII/2026/0142',    beneficiary: { id: 'V001', name: 'PT Sumber Makmur Sejahtera' },  confidence: 96, classification: 'bill',         date: '2026-07-01', amount: 12_500_000 },
  { id: 'RF002', file: 'receipt_002.jpg',       number: 'KWT-070226-018',       beneficiary: { id: 'V002', name: 'CV Abadi Jaya Teknik' },        confidence: 88, classification: 'receipt',      date: '2026-07-02', amount: 1_250_000  },
  { id: 'RF003', file: 'scan_0003.png',         number: undefined,              beneficiary: { id: 'V003', name: 'PT Mitra Global Solusi' },      confidence: 54, classification: 'unclassified', date: '2026-07-03', amount: 8_200_000  },
  { id: 'RF004', file: 'bill_software.pdf',     number: '0142/BILL/VII/26',     beneficiary: { id: 'V004', name: 'PT Karya Cipta Mandiri' },      confidence: 92, classification: 'bill',         date: '2026-07-04', amount: 15_800_000 },
  { id: 'RF005', file: 'travel_receipt.jpg',    number: 'RCP-88213',            beneficiary: { id: 'V005', name: 'CV Berkah Utama Indonesia' },   confidence: 79, classification: 'receipt',      date: '2026-07-05', amount: 6_750_000  },
  { id: 'RF006', file: 'utility_bill_06.pdf',   number: 'No. 2026/07/0301',     beneficiary: { id: 'V006', name: 'PT Teknindo Nusantara' },       confidence: 95, classification: 'bill',         date: '2026-07-06', amount: 21_000_000 },
  { id: 'RF007', file: 'forwarded_007.pdf',     number: undefined,              beneficiary: { id: 'V007', name: 'PT Solusi Pratama Abadi' },     confidence: 41, classification: 'unclassified', date: '2026-07-07', amount: 9_300_000  },
  { id: 'RF008', file: 'office_supplies.xlsx',  number: 'Tagihan No. 2260-B',   beneficiary: { id: 'V008', name: 'CV Harapan Bangsa Jaya' },      confidence: 83, classification: 'bill',         date: '2026-07-08', amount: 4_500_000  },
  { id: 'RF009', file: 'maintenance_receipt.jpg', number: 'Kwitansi No. 019/IX', beneficiary: { id: 'V003', name: 'PT Mitra Global Solusi' },    confidence: 90, classification: 'receipt',      date: '2026-07-09', amount: 18_200_000 },
  { id: 'RF010', file: 'scan_0010.png',         number: undefined,              beneficiary: { id: 'V009', name: 'PT Dinamika Usaha Bersama' },   confidence: 62, classification: 'unclassified', date: '2026-07-10', amount: 3_400_000  },
  { id: 'RF011', file: 'equipment_invoice.pdf', number: 'TAGIHAN/07/26-0055',   beneficiary: { id: 'V001', name: 'PT Sumber Makmur Sejahtera' },  confidence: 97, classification: 'bill',         date: '2026-07-11', amount: 42_000_000 },
  { id: 'RF012', file: 'travel_receipt_012.jpg',number: 'RCP20260712',          beneficiary: { id: 'V010', name: 'CV Prima Sentosa Raya' },       confidence: 85, classification: 'receipt',      date: '2026-07-12', amount: 7_800_000  },
  { id: 'RF013', file: 'software_license.csv',  number: '0037/INV-SW/2026',     beneficiary: { id: 'V002', name: 'CV Abadi Jaya Teknik' },        confidence: 91, classification: 'bill',         date: '2026-07-13', amount: 5_200_000  },
  { id: 'RF014', file: 'marketing_bill.pdf',    number: undefined,              beneficiary: { id: 'V005', name: 'CV Berkah Utama Indonesia' },   confidence: 47, classification: 'unclassified', date: '2026-07-14', amount: 26_500_000 },
])

let reviewFileIdSeq = 0

/** Expenses and Purchase invoices each keep their own independent review
 *  queue — a file uploaded from one tab never silently appears on the other;
 *  it only crosses over via the explicit "Move files to X" bulk action
 *  (see moveReviewFilesToPurchaseInvoice / moveReviewFilesToExpenses below). */
export type ReviewSurface = 'expenses' | 'purchase-invoices'

function queueFor(surface: ReviewSurface): ReviewFile[] {
  return surface === 'purchase-invoices' ? purchaseInvoiceReviewFiles : reviewFiles
}

/** OCR-read document numbers are never uniform — format depends on what kind
 *  of document it is, and unclassified files usually didn't have a readable
 *  number to begin with. */
function randomDocNumber(classification: FileClassification): string | undefined {
  const seq = Math.floor(1 + Math.random() * 9999)
  switch (classification) {
    case 'bill':     return `INV/${String(seq).padStart(4, '0')}/VII/26`
    case 'invoice':  return `${String(seq).padStart(4, '0')}/INV/2026`
    case 'receipt':  return `KWT-${seq}`
    default:         return undefined
  }
}

/** Drop a freshly-uploaded file into the review table as a "processing" row —
 *  only the filename is known yet, every other column renders a skeleton bar
 *  (see BillsReviewFilesPage.vue's cell-* templates) until the simulated OCR
 *  pass below resolves it in place. Lands in whichever queue matches the
 *  surface it was uploaded from, regardless of what OCR later classifies it as. */
export function addProcessingReviewFile(filename: string, surface: ReviewSurface = 'expenses'): ReviewFile {
  const queue = queueFor(surface)
  const row: ReviewFile = {
    id: `RF-NEW-${++reviewFileIdSeq}`,
    file: filename,
    number: undefined,
    beneficiary: { id: '', name: '' },
    confidence: 0,
    classification: 'unclassified',
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    processing: true,
  }
  queue.unshift(row)

  // Simulated OCR extraction pass — real values land ~1.2-2.2s later, same row.
  const delay = 1200 + Math.random() * 1000
  setTimeout(() => resolveProcessingReviewFile(row.id, queue), delay)

  return row
}

/** Drop a freshly-UPLOADED file into the review table with OCR NOT yet run —
 *  only the filename shows; number/vendor/confidence/classification/date/amount
 *  stay blank until OCR runs later on the row. (Separate from the auto-scanning
 *  `addProcessingReviewFile` above.) */
export function addUploadedReviewFile(filename: string, surface: ReviewSurface = 'expenses'): ReviewFile {
  const queue = queueFor(surface)
  const row: ReviewFile = {
    id: `RF-NEW-${++reviewFileIdSeq}`,
    file: filename,
    number: undefined,
    beneficiary: { id: '', name: '' },
    confidence: 0,
    classification: 'unclassified',
    date: '',
    amount: 0,
    processing: false,
    scanned: false,
  }
  queue.unshift(row)
  return row
}

/** Run OCR on a previously-uploaded row — fills its fields and marks it scanned. */
export function scanReviewFile(id: string, surface: ReviewSurface = 'expenses'): void {
  const queue = queueFor(surface)
  const row = queue.find((rf) => rf.id === id)
  if (!row || row.scanned) return
  row.processing = true
  setTimeout(() => {
    resolveProcessingReviewFile(row.id, queue)
    row.date = new Date().toISOString().slice(0, 10)
    row.scanned = true
  }, 1200 + Math.random() * 1000)
}

/** OCR can land on any of the four classifications no matter which surface
 *  the file was uploaded to — a bill dropped into Purchase invoices' queue
 *  still shows up there as "Expenses" until someone moves it out. */
const CLASSIFICATIONS: FileClassification[] = ['bill', 'invoice', 'receipt', 'unclassified']

function resolveProcessingReviewFile(id: string, queue: ReviewFile[]): void {
  const row = queue.find((rf) => rf.id === id)
  if (!row) return
  const vendor = VENDORS[Math.floor(Math.random() * VENDORS.length)]!
  row.beneficiary = { id: vendor, name: vendor }
  row.confidence = Math.floor(40 + Math.random() * 60)
  row.classification = CLASSIFICATIONS[Math.floor(Math.random() * CLASSIFICATIONS.length)]!
  row.number = randomDocNumber(row.classification)
  row.amount = Math.round((500_000 + Math.random() * 40_000_000) / 1000) * 1000
  row.processing = false
}

/** Delete one or more review files (bulk or single) from the given surface's
 *  queue. Returns the count actually removed. */
export function deleteReviewFiles(ids: string[], surface: ReviewSurface = 'expenses'): number {
  const queue = queueFor(surface)
  const idSet = new Set(ids)
  let removed = 0
  for (let i = queue.length - 1; i >= 0; i--) {
    if (idSet.has(queue[i]!.id)) {
      queue.splice(i, 1)
      removed++
    }
  }
  return removed
}

/** Purchase invoices' own review queue — the counterpart to `reviewFiles`
 *  above, read by the Inbox tab on Purchase invoices and by the shared
 *  /purchase-invoices/review/:id route. Files bulk-moved out of the Expenses
 *  queue ("Move files to Purchase invoice") land here too.
 *
 *  The seed mirrors Figma 4712:75379's five-file run: two invoices, two
 *  payment receipts, and one document OCR couldn't classify. Each review page
 *  seeds its own extracted content from the scenario FAB (same approach as
 *  BillReviewPage), so only the table-row fields live here. */
export const purchaseInvoiceReviewFiles = reactive<ReviewFile[]>([
  { id: 'PIRF001', file: 'INV-EXP-0426-01.pdf',    number: '0142/INV/2026',        beneficiary: { id: 'V011', name: 'EXPAT Roasters Bali' },        confidence: 94, classification: 'invoice',      date: '2026-04-30', amount: 1_150_000 },
  { id: 'PIRF002', file: 'INV-EXP-0426-02.pdf',    number: 'INV/IV/2026/0089',     beneficiary: { id: 'V012', name: 'PT Kopi Nusantara Jaya' },     confidence: 89, classification: 'invoice',      date: '2026-04-28', amount: 4_320_000 },
  { id: 'PIRF003', file: 'receipt_tera_0417.pdf',  number: 'KWT-TERA-0417',        beneficiary: { id: 'V013', name: 'Tera Logistics' },             confidence: 91, classification: 'receipt',      date: '2026-04-17', amount: 2_400_000 },
  { id: 'PIRF004', file: 'Receipt from PT Inspirasi Digital Eksperiensia.pdf', number: 'Kwitansi 04/17',   beneficiary: { id: 'V014', name: 'PT Inspirasi Digital Eksperiensia' }, confidence: 96, classification: 'receipt', date: '2026-04-17', amount: 800_000 },
  { id: 'PIRF005', file: 'NOTA_3313.pdf',          number: undefined,              beneficiary: { id: '', name: '' },                               confidence: 38, classification: 'unclassified', date: '2026-04-22', amount: 0 },
])

/** Move one or more review files out of the Expenses review queue and into
 *  the Purchase invoices staging list (see purchaseInvoiceReviewFiles above).
 *  Returns the count actually moved. */
export function moveReviewFilesToPurchaseInvoice(ids: string[]): number {
  const idSet = new Set(ids)
  let moved = 0
  for (let i = reviewFiles.length - 1; i >= 0; i--) {
    const rf = reviewFiles[i]!
    if (idSet.has(rf.id)) {
      purchaseInvoiceReviewFiles.unshift(rf)
      reviewFiles.splice(i, 1)
      moved++
    }
  }
  return moved
}

/** Reverse of the above — moves files out of Purchase invoices' review queue
 *  and into Expenses' (e.g. a bill someone uploaded from the wrong tab).
 *  Returns the count actually moved. */
export function moveReviewFilesToExpenses(ids: string[]): number {
  const idSet = new Set(ids)
  let moved = 0
  for (let i = purchaseInvoiceReviewFiles.length - 1; i >= 0; i--) {
    const rf = purchaseInvoiceReviewFiles[i]!
    if (idSet.has(rf.id)) {
      reviewFiles.unshift(rf)
      purchaseInvoiceReviewFiles.splice(i, 1)
      moved++
    }
  }
  return moved
}
