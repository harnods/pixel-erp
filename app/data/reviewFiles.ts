import { reactive } from 'vue'
import type { ReviewFile, FileClassification } from './types'
import { VENDORS } from './master'

export const reviewFiles = reactive<ReviewFile[]>([
  { id: 'RF001', file: 'invoice_scan_001.pdf',  number: 25, beneficiary: { id: 'V001', name: 'PT Sumber Makmur Sejahtera' },  confidence: 96, classification: 'bill',         date: '2026-07-01', amount: 12_500_000 },
  { id: 'RF002', file: 'receipt_002.jpg',       number: 26, beneficiary: { id: 'V002', name: 'CV Abadi Jaya Teknik' },        confidence: 88, classification: 'receipt',      date: '2026-07-02', amount: 1_250_000  },
  { id: 'RF003', file: 'scan_0003.png',         number: 27, beneficiary: { id: 'V003', name: 'PT Mitra Global Solusi' },      confidence: 54, classification: 'unclassified', date: '2026-07-03', amount: 8_200_000  },
  { id: 'RF004', file: 'bill_software.pdf',     number: 28, beneficiary: { id: 'V004', name: 'PT Karya Cipta Mandiri' },      confidence: 92, classification: 'bill',         date: '2026-07-04', amount: 15_800_000 },
  { id: 'RF005', file: 'travel_receipt.jpg',    number: 29, beneficiary: { id: 'V005', name: 'CV Berkah Utama Indonesia' },   confidence: 79, classification: 'receipt',      date: '2026-07-05', amount: 6_750_000  },
  { id: 'RF006', file: 'utility_bill_06.pdf',   number: 30, beneficiary: { id: 'V006', name: 'PT Teknindo Nusantara' },       confidence: 95, classification: 'bill',         date: '2026-07-06', amount: 21_000_000 },
  { id: 'RF007', file: 'forwarded_007.pdf',     number: 31, beneficiary: { id: 'V007', name: 'PT Solusi Pratama Abadi' },     confidence: 41, classification: 'unclassified', date: '2026-07-07', amount: 9_300_000  },
  { id: 'RF008', file: 'office_supplies.xlsx',  number: 32, beneficiary: { id: 'V008', name: 'CV Harapan Bangsa Jaya' },      confidence: 83, classification: 'bill',         date: '2026-07-08', amount: 4_500_000  },
  { id: 'RF009', file: 'maintenance_receipt.jpg', number: 33, beneficiary: { id: 'V003', name: 'PT Mitra Global Solusi' },    confidence: 90, classification: 'receipt',      date: '2026-07-09', amount: 18_200_000 },
  { id: 'RF010', file: 'scan_0010.png',         number: 34, beneficiary: { id: 'V009', name: 'PT Dinamika Usaha Bersama' },   confidence: 62, classification: 'unclassified', date: '2026-07-10', amount: 3_400_000  },
  { id: 'RF011', file: 'equipment_invoice.pdf', number: 35, beneficiary: { id: 'V001', name: 'PT Sumber Makmur Sejahtera' },  confidence: 97, classification: 'bill',         date: '2026-07-11', amount: 42_000_000 },
  { id: 'RF012', file: 'travel_receipt_012.jpg',number: 36, beneficiary: { id: 'V010', name: 'CV Prima Sentosa Raya' },       confidence: 85, classification: 'receipt',      date: '2026-07-12', amount: 7_800_000  },
  { id: 'RF013', file: 'software_license.csv',  number: 37, beneficiary: { id: 'V002', name: 'CV Abadi Jaya Teknik' },        confidence: 91, classification: 'bill',         date: '2026-07-13', amount: 5_200_000  },
  { id: 'RF014', file: 'marketing_bill.pdf',    number: 38, beneficiary: { id: 'V005', name: 'CV Berkah Utama Indonesia' },   confidence: 47, classification: 'unclassified', date: '2026-07-14', amount: 26_500_000 },
])

let reviewFileSeq = reviewFiles.reduce((max, rf) => Math.max(max, rf.number), 0)
let reviewFileIdSeq = 0

/** Drop a freshly-uploaded file into the review table as a "processing" row —
 *  only the filename is known yet, every other column renders a skeleton bar
 *  (see BillsReviewFilesPage.vue's cell-* templates) until the simulated OCR
 *  pass below resolves it in place. */
export function addProcessingReviewFile(filename: string): ReviewFile {
  const row: ReviewFile = {
    id: `RF-NEW-${++reviewFileIdSeq}`,
    file: filename,
    number: ++reviewFileSeq,
    beneficiary: { id: '', name: '' },
    confidence: 0,
    classification: 'unclassified',
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    processing: true,
  }
  reviewFiles.unshift(row)

  // Simulated OCR extraction pass — real values land ~1.2-2.2s later, same row.
  const delay = 1200 + Math.random() * 1000
  setTimeout(() => resolveProcessingReviewFile(row.id), delay)

  return row
}

const CLASSIFICATIONS: FileClassification[] = ['bill', 'receipt', 'unclassified']

function resolveProcessingReviewFile(id: string): void {
  const row = reviewFiles.find((rf) => rf.id === id)
  if (!row) return
  const vendor = VENDORS[Math.floor(Math.random() * VENDORS.length)]!
  row.beneficiary = { id: vendor, name: vendor }
  row.confidence = Math.floor(40 + Math.random() * 60)
  row.classification = CLASSIFICATIONS[Math.floor(Math.random() * CLASSIFICATIONS.length)]!
  row.amount = Math.round((500_000 + Math.random() * 40_000_000) / 1000) * 1000
  row.processing = false
}

/** Delete one or more review files (bulk or single). Returns the count actually removed. */
export function deleteReviewFiles(ids: string[]): number {
  const idSet = new Set(ids)
  let removed = 0
  for (let i = reviewFiles.length - 1; i >= 0; i--) {
    if (idSet.has(reviewFiles[i]!.id)) {
      reviewFiles.splice(i, 1)
      removed++
    }
  }
  return removed
}

/** Staging list for files bulk-moved out of Expenses' review queue because
 *  they turned out to be purchase invoices, not bills/receipts — no
 *  Purchase invoices review-files UI reads this yet, but the data is kept
 *  rather than dropped so that surface can pick it up later. */
export const purchaseInvoiceReviewFiles = reactive<ReviewFile[]>([])

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
