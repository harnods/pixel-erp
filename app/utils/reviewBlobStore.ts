/**
 * Review-file blob store — the raw bytes of an uploaded Dropbox file, kept in
 * IndexedDB (not localStorage, whose ~5MB quota can't hold PDFs/images) so the
 * File Review page can show the ACTUAL document the user uploaded, and it
 * survives a refresh. Keyed by the review-file id. Degrades to no-op/undefined
 * when IndexedDB is unavailable (the review page then falls back to a placeholder).
 */
const DB_NAME = 'erp-review-files'
const STORE = 'blobs'
const VERSION = 1

export interface ReviewBlobRecord {
  id: string          // review-file id (RF-NEW-… / PIRF…)
  fileName: string
  mime: string
  dataUrl: string     // raw file as a data: URL, for preview/download
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    try {
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function putReviewBlob(rec: ReviewBlobRecord): Promise<void> {
  const db = await idb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(rec)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch { resolve() }
  })
}

export async function getReviewBlob(id: string): Promise<ReviewBlobRecord | undefined> {
  const db = await idb()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result as ReviewBlobRecord | undefined)
      req.onerror = () => resolve(undefined)
    } catch { resolve(undefined) }
  })
}

export async function deleteReviewBlob(id: string): Promise<void> {
  const db = await idb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch { resolve() }
  })
}
