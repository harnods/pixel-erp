/**
 * Bank statement OCR review — the queue behind /cash-management/review/:id.
 *
 * Uploading files through Cash management's "Import with OCR" modal drops them
 * here; the review page then walks the run one file at a time, the same way the
 * Expenses / Purchase invoices review queues work.
 *
 * Everything is dummy: `extractStatementLines` fabricates what OCR "read" off
 * the document rather than parsing anything. The first ten lines of the Mandiri
 * sample mirror the actual rows printed on the reference statement so the left
 * preview and the right-hand table line up; the rest are filler so the
 * "Load 10 more" paging has something to reveal.
 */

import type { ReviewFile } from './types'

/** One row of the statement as OCR lifted it off the page. Amounts are signed:
 *  negative = money out, positive = money in — the review table renders the
 *  sign as accounting parentheses rather than a minus. */
export interface StatementLineDraft {
  id: string
  /** ISO yyyy-mm-dd — bound to the row's date picker. */
  date: string
  description: string
  /** null when OCR couldn't read an amount — the row renders empty and the
   *  user has to fill it in before the file can be saved. */
  amount: number | null
}

export interface BankStatementReviewFile extends ReviewFile {
  /** Chart-of-accounts id this statement belongs to. Empty when OCR couldn't
   *  match a bank — the user picks the account manually. */
  accountId: string
  /** Bank name as it appeared in the document, when AI matched one — drives the
   *  "AI matched — {bank} in doc" hint under the Account field. */
  aiMatchedBank?: string
  /** Preview image for the source document (public path). */
  preview?: string
  lines: StatementLineDraft[]
}

// ─── The Mandiri sample's real rows (page 1 of the reference statement) ──────

const MANDIRI_PAGE_1: { date: string; description: string; amount: number }[] = [
  { date: '2025-03-03', description: 'PEMBAYARAN ITERNETCBN 893089620090924',            amount: -255_200   },
  { date: '2025-03-03', description: 'BIAYA TRANSFER BI FAST',                            amount: -2_500     },
  { date: '2025-03-03', description: 'TRANSFER BI FAST KE BRI KRISNA HERAWATI',           amount: -500_000   },
  { date: '2025-03-07', description: 'TRANSFER DARI BANK BRI UUS RIADI 093601090786536',  amount: 100_000    },
  { date: '2025-03-09', description: 'PENARIKAN TUNAI DI ATM BANK MANDIRI PB 3417526N',   amount: -1_000_000 },
  { date: '2025-03-09', description: 'PENARIKAN TUNAI DI ATM MERAH PUTIH 49937902',       amount: -500_000   },
  { date: '2025-03-09', description: 'TRANSFER DARI BANK MANDIRI AROH 1330030652549',     amount: 500_000    },
  { date: '2025-03-13', description: 'PENARIKAN TUNAI DI ATM BANK MANDIRI PT LGINNOTEK',  amount: -500_000   },
  { date: '2025-03-14', description: 'BIAYA TRANSFER BI FAST',                            amount: -2_500     },
  { date: '2025-03-14', description: 'TRANSFER BI FAST KE BCA MUHADI 0661424574',         amount: -5_000_000 },
]

/** Filler rows for pages 2-3 of the statement — same shape, plausible remarks.
 *  A couple deliberately come back with no amount so the "OCR missed a field"
 *  path is reachable in the prototype. */
const MANDIRI_REST: { date: string; description: string; amount: number | null }[] = [
  { date: '2025-03-17', description: 'TRANSFER DARI BANK BCA PT KOPI KENANGAN',           amount: 12_500_000 },
  { date: '2025-03-17', description: 'BIAYA ADM BULANAN MAR 2025',                        amount: -15_000    },
  { date: '2025-03-18', description: 'PEMBAYARAN PLN PREPAID 3210009283',                 amount: -750_000   },
  { date: '2025-03-19', description: 'AUTO DEBIT TELKOM INDONESIA WIFI',                  amount: -455_000   },
  { date: '2025-03-20', description: 'TRANSFER DARI BANK MANDIRI CV MESIN BARISTA',       amount: 8_250_000  },
  { date: '2025-03-21', description: 'QRIS SETTLEMENT MERCHANT',                          amount: 3_120_000  },
  { date: '2025-03-24', description: 'TRANSFER BI FAST KE BNI SUPPLIER KEMASAN',          amount: -2_400_000 },
  { date: '2025-03-25', description: 'PENARIKAN TUNAI DI ATM BANK MANDIRI KEMANG',        amount: -1_500_000 },
  { date: '2025-03-26', description: 'PEMBAYARAN SEWA GEDUNG MAR 2025',                   amount: null       },
  { date: '2025-03-27', description: 'TRANSFER DARI BANK BRI HOTEL INDONESIA GROUP',      amount: 6_400_000  },
  { date: '2025-03-28', description: 'BIAYA TRANSFER BI FAST',                            amount: -2_500     },
  { date: '2025-03-28', description: 'PEMBAYARAN GAJI KARYAWAN MAR 2025',                 amount: -9_800_000 },
  { date: '2025-03-31', description: 'BUNGA TABUNGAN MAR 2025',                           amount: null       },
  { date: '2025-03-31', description: 'PAJAK BUNGA TABUNGAN',                              amount: -3_400     },
]

/** Generic filler for any file that isn't the Mandiri sample — keeps every
 *  uploaded file's review page populated without hand-authoring each one. */
const GENERIC_LINES: { date: string; description: string; amount: number | null }[] = [
  { date: '2026-01-20', description: 'TRF CR LLG PT KOPI KENANGAN BERKAH',   amount: 15_500_000 },
  { date: '2026-01-19', description: 'AUTO DEBIT TELKOM INDONESIA WIFI',     amount: -2_500_000 },
  { date: '2026-01-18', description: 'TRF CR RTGS CV MESIN BARISTA UTAMA',   amount: 50_000_000 },
  { date: '2026-01-18', description: 'PAY PLN PREPAID 3210009283',           amount: -12_500_000 },
  { date: '2026-01-17', description: 'TRF E-BANKING IBU SUSI (TOKO KUE)',    amount: 8_250_000  },
  { date: '2026-01-16', description: 'TRF DB BUDI SANTOSO REFUND',           amount: -1_250_000 },
  { date: '2026-01-15', description: 'CASH DEP CDM DEPOK BRANCH',            amount: 4_500_000  },
  { date: '2026-01-15', description: 'ADM FEE MTHLY JAN 2026',               amount: -25_000    },
  { date: '2026-01-14', description: 'TRF DB PETTY CASH REPLENISH',          amount: null       },
  { date: '2026-01-13', description: 'TRF CR PT SINAR MAS DISTRIBUSI',       amount: 25_000_000 },
  { date: '2026-01-12', description: 'VS *GOOGLE CLOUD SVCS',                amount: -1_800_000 },
  { date: '2026-01-11', description: 'TRF CR CAFE SENJA ABADI',              amount: 12_000_000 },
  { date: '2026-01-10', description: 'TRF CR HOTEL INDONESIA GROUP',         amount: 35_000_000 },
  { date: '2026-01-09', description: 'DB ATK OFFICE SUPPLIES',               amount: -750_000   },
  { date: '2026-01-08', description: 'TRF CR LLG PT KOPI KENANGAN BERKAH',   amount: 10_000_000 },
  { date: '2026-01-07', description: 'REVERSAL TRF E-BANKING',               amount: 2_000_000  },
  { date: '2026-01-06', description: 'TRF DB RIZAL CANDRA PRIVE',            amount: -10_000_000 },
  { date: '2026-01-05', description: 'TRF CR WARUNG UPNORMAL',               amount: 5_500_000  },
  { date: '2026-01-05', description: 'VS *ADOBE CREATIVE DUB',               amount: -850_000   },
  { date: '2026-01-04', description: 'CASH DEP SETORAN TUNAI',               amount: 8_000_000  },
  { date: '2026-01-03', description: 'QRIS SETTLEMENT PARKIR',               amount: -200_000   },
  { date: '2026-01-03', description: 'TRF CR JONI KARYAWAN',                 amount: 1_500_000  },
  { date: '2026-01-02', description: 'TRF CR CV MAJU MUNDUR',                amount: 7_000_000  },
  { date: '2026-01-01', description: 'TRF DB PEMILIK GEDUNG SEWA JAN',       amount: -15_000_000 },
]

/** Which bank a filename looks like it came from — stands in for OCR reading
 *  the bank's name off the letterhead. Returns the matching cash account. */
const BANK_HINTS: { match: RegExp; bank: string; accountId: string }[] = [
  { match: /mandiri/i, bank: 'Mandiri',  accountId: 'CA008' },
  { match: /bca/i,     bank: 'BCA',      accountId: 'CA003' },
  { match: /dbs/i,     bank: 'DBS',      accountId: 'CA004' },
]

/** Falls back to the first hint when the filename doesn't name a bank —
 *  OCR always proposes something, it's never left for the user to guess. */
function detectBank(filename: string) {
  return BANK_HINTS.find((h) => h.match.test(filename)) ?? BANK_HINTS[0]
}

/** Fabricate the lines OCR "found" in a given file. */
export function extractStatementLines(filename: string): StatementLineDraft[] {
  const isMandiri = /mandiri/i.test(filename)
  const source = isMandiri ? [...MANDIRI_PAGE_1, ...MANDIRI_REST] : GENERIC_LINES
  return source.map((l, i) => ({ id: `${filename}-L${i}`, date: l.date, description: l.description, amount: l.amount }))
}

let seq = 0

/** Build a queue entry for a file dropped on the Import with OCR modal. */
export function createBankStatementReviewFile(filename: string): BankStatementReviewFile {
  const hint = detectBank(filename)
  const lines = extractStatementLines(filename)
  const total = lines.reduce((sum, l) => sum + (l.amount ?? 0), 0)
  return {
    id: `BSR${String(++seq).padStart(3, '0')}`,
    file: filename,
    beneficiary: { id: hint?.accountId ?? '', name: hint?.bank ?? '' },
    confidence: hint ? 96 : 72,
    classification: 'bank_statement',
    date: lines[0]?.date ?? '2026-01-20',
    amount: total,
    accountId: hint?.accountId ?? '',
    aiMatchedBank: hint?.bank,
    preview: '/illustrations/ocr/bank-statement.png',
    lines,
  }
}

/** The live queue — starts empty and fills as files are uploaded. */
export const bankStatementReviewFiles: BankStatementReviewFile[] = []

/** Replace the queue with a fresh run for the given filenames. Returns the run
 *  so the caller can navigate to its first file. */
export function startBankStatementReview(filenames: string[]): BankStatementReviewFile[] {
  bankStatementReviewFiles.splice(0, bankStatementReviewFiles.length)
  seq = 0
  for (const name of filenames) bankStatementReviewFiles.push(createBankStatementReviewFile(name))
  return bankStatementReviewFiles
}

/** The queue only ever fills from an upload, so a reload — or a shared/deep
 *  link straight to /cash-management/review/:id — would otherwise land on an
 *  empty run. Seed the sample files so the page stays reachable on its own. */
export function ensureBankStatementReviewRun(): BankStatementReviewFile[] {
  if (bankStatementReviewFiles.length === 0) {
    startBankStatementReview(['Bank_Statement_Mandiri.pdf', 'Bank_BCA_09022026.pdf'])
  }
  return bankStatementReviewFiles
}
