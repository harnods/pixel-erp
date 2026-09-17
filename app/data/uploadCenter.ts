/**
 * Upload center — the shared queue behind the header "activity" popover.
 *
 * When the user uploads files (e.g. "Upload vendor invoices" on Purchase
 * invoices), a batch is created here and each file's upload progress is
 * simulated. As each file finishes UPLOADING it is dropped into the matching
 * review-files queue (`addProcessingReviewFile`) — OCR then runs there, on the
 * Inbox tab. So this store models the *upload* step only; scanning is separate.
 */
import { reactive, ref, computed } from 'vue'
import { addUploadedReviewFile } from './reviewFiles'
import { enqueueOcr } from './ocrQueue'
import type { ReviewSurface } from './reviewFiles'

export interface UploadItem { name: string; progress: number; done: boolean }
export interface UploadBatch {
  id: string
  surface: ReviewSurface
  label: string          // e.g. "Upload vendor invoices"
  by: string             // who uploaded
  startedAt: number
  items: UploadItem[]
}

export const uploadBatches = reactive<UploadBatch[]>([])
/** Bound to the header activity popover's open state (auto-opens on upload). */
export const uploadCenterOpen = ref(false)

let _seq = 0

export function batchTotal(b: UploadBatch): number { return b.items.length }
export function batchDone(b: UploadBatch): number { return b.items.filter((i) => i.done).length }
export function batchPercent(b: UploadBatch): number {
  if (!b.items.length) return 0
  return Math.round(b.items.reduce((s, i) => s + i.progress, 0) / b.items.length)
}
export function batchUploading(b: UploadBatch): boolean { return b.items.some((i) => !i.done) }

export const hasActiveUpload = computed(() => uploadBatches.some(batchUploading))

/**
 * Start an upload batch. Each file "uploads" over ~1s (staggered), and lands in
 * the review-files Inbox for its surface the moment it finishes.
 */
export function startUpload(files: File[], surface: ReviewSurface, label: string, by = 'Rizal Candra'): UploadBatch {
  const batch: UploadBatch = {
    id: `up-${++_seq}`,
    surface, label, by,
    startedAt: Date.now(),
    items: files.map((f) => ({ name: f.name, progress: 0, done: false })),
  }
  uploadBatches.unshift(batch)
  // Mutate through the reactive proxy stored in the array (NOT the local plain
  // object) so the header popover's progress actually updates.
  const stored = uploadBatches[0]!

  stored.items.forEach((item, i) => {
    const file = files[i]!
    // Stagger the files so the popover shows a rolling count, not all at once.
    setTimeout(() => {
      const iv = setInterval(() => {
        item.progress = Math.min(100, item.progress + 25)
        if (item.progress >= 100) {
          clearInterval(iv)
          item.done = true
          // Uploaded → lands in Dropbox (OCR NOT yet run, fields blank), then the
          // AI agent OCRs it in the background (one at a time — see ocrQueue).
          const row = addUploadedReviewFile(item.name, surface, by)
          enqueueOcr(row, file)
          // Once nothing is left uploading, auto-hide the header monitor popover
          // (a short beat so the user still sees the final 100%/done state).
          if (!hasActiveUpload.value) {
            setTimeout(() => { if (!hasActiveUpload.value) uploadCenterOpen.value = false }, 900)
          }
        }
      }, 220)
    }, i * 350)
  })

  return stored
}

/** Clear finished batches (from the popover's "clear"/close). */
export function clearFinishedUploads(): void {
  for (let i = uploadBatches.length - 1; i >= 0; i--) {
    if (!batchUploading(uploadBatches[i]!)) uploadBatches.splice(i, 1)
  }
}
