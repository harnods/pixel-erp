/**
 * OCR queue — after files land in the Dropbox (file-name-only rows), the AI agent
 * OCRs them ONE AT A TIME in the background via /api/expenses/ocr (Gemini vision).
 * While a row is being scanned its `scanning` flag is set (spinner next to the
 * filename); when done, the row's fields + confidence are filled and `scanned`
 * flips true. Rows are the reactive objects from reviewFiles/purchaseInvoiceReviewFiles,
 * so mutating them updates the table live.
 */
import type { ReviewFile, FileClassification } from './types'
import { persistReviewFiles } from './reviewFiles'
import { putReviewBlob } from '~/utils/reviewBlobStore'

interface OcrJob { row: ReviewFile; file: File }

const queue: OcrJob[] = []
let running = false

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
      }>('/api/expenses/ocr', {
        method: 'POST',
        body: { fileName: file.name, mime: file.type, dataBase64 },
      })
      row.number = res.number || undefined
      row.beneficiary = { id: '', name: res.vendorName || '' }
      row.date = res.date || ''
      row.amount = res.amount || 0
      row.classification = res.classification || 'unclassified'
      row.confidence = res.confidence || 0
    } catch {
      // Extraction failed — leave the fields blank but still mark the row done so
      // it isn't stuck showing a spinner forever.
    } finally {
      row.scanning = false
      row.scanned = true
      persistReviewFiles()   // OCR result survives a refresh (mini-DB snapshot)
    }
  }
  running = false
}
