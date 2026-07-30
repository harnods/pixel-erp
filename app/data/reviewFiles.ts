import type { ReviewFile } from './types'

export const reviewFiles: ReviewFile[] = [
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
]
