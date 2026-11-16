/**
 * OCR queue — after files land in the Dropbox (file-name-only rows), the AI agent
 * OCRs them ONE AT A TIME in the background via /api/expenses/ocr (Gemini vision).
 * While a row is being scanned its `scanning` flag is set (spinner next to the
 * filename); when done, the row's fields + confidence are filled and `scanned`
 * flips true. Rows are the reactive objects from reviewFiles/purchaseInvoiceReviewFiles,
 * so mutating them updates the table live.
 *
 * Offline/local: with no NUXT_GEMINI_API_KEY the route can't call a model, so the
 * row is filled from `mockOcrExtraction()` instead — an upload always lands as a
 * usable row. Real OCR takes over automatically once a key is in .env.
 */
import type { ReviewFile, FileClassification } from './types'
import { persistReviewFiles, mockOcrExtraction } from './reviewFiles'
import { putReviewBlob } from '~/utils/reviewBlobStore'

interface OcrJob { row: ReviewFile; file: File }

const queue: OcrJob[] = []
let running = false

/** OCR date sanity gate — the model is asked for YYYY-MM-DD but can return ''
 *  (unreadable), a dash, or free-form Indonesian ("31 Juli 2026"), and the route
 *  returns '' on any failure (no API key, parse error). Anything that isn't a
 *  real calendar date is stored as '' so the table renders "—" instead of
 *  formatting an Invalid Date. */
function normalizeOcrDate(raw: string | undefined): string {
  const s = String(raw ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  // Round-trip: JS rolls an out-of-range day over ('2026-02-30' → 2 Mar), and a
  // silently wrong date is worse than none.
  return d.toISOString().slice(0, 10) === s ? s : ''
}

let warnedNoOcr = false

/** No real extraction happened (no NUXT_GEMINI_API_KEY configured, the route
 *  errored, or it was unreachable). This is a prototype, so fill the row with the
 *  same demo extraction the simulated in-table scan uses — a local upload should
 *  land as a usable, filled row, not an all-dashes one. Add a real key to .env to
 *  get true OCR instead. */
function applyMockOcr(row: ReviewFile, why: string): void {
  Object.assign(row, mockOcrExtraction())
  if (!warnedNoOcr) {
    warnedNoOcr = true
    console.info(`[ocr] ${why} — filling uploaded rows with demo extraction. Set NUXT_GEMINI_API_KEY in .env for real OCR.`)
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Queue a freshly-uploaded row for background OCR. */
export function enqueueOcr(row: ReviewFile, file: File): void {
  queue.push({ row, file })
  if (!running) void runQueue()
}

async function runQueue(): Promise<void> {
  running = true
  while (queue.length) {
    const { row, file } = queue.shift()!
    row.scanning = true
    try {
      const dataBase64 = await fileToDataUrl(file)
      // Keep the actual bytes so the File Review page can show the real document
      // (survives refresh — IndexedDB). Fire-and-forget; not required for OCR.
      void putReviewBlob({ id: row.id, fileName: file.name, mime: file.type, dataUrl: dataBase64 })
      const res = await $fetch<{
        number: string; vendorName: string; date: string; amount: number
        classification: FileClassification; confidence: number
        source: string; error?: string
      }>('/api/expenses/ocr', {
        method: 'POST',
        body: { fileName: file.name, mime: file.type, dataBase64 },
      })
      // `source` tells us whether a model actually read the file: 'gemini' = real
      // extraction (trust it, blanks included); 'fallback'/'error' = nothing ran.
      if (res.source === 'gemini') {
        row.number = res.number || undefined
        row.beneficiary = { id: '', name: res.vendorName || '' }
        row.date = normalizeOcrDate(res.date)
        row.amount = res.amount || 0
        row.classification = res.classification || 'unclassified'
        row.confidence = res.confidence || 0
      } else {
        applyMockOcr(row, res.error || `OCR unavailable (${res.source})`)
      }
    } catch {
      // Route unreachable — still land a usable row rather than a blank one, and
      // never leave the spinner spinning forever (see the finally below).
      applyMockOcr(row, 'OCR request failed')
    } finally {
      row.scanning = false
      row.scanned = true
      persistReviewFiles()   // OCR result survives a refresh (mini-DB snapshot)
    }
  }
  running = false
}
