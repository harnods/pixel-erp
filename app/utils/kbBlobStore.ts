/**
 * KB blob store — the full extracted text and the raw file bytes for a Knowledge
 * Base doc, kept out of localStorage (which holds only a capped snapshot) so the
 * ~5MB quota isn't blown by large PDFs/spreadsheets. Backed by IndexedDB; every
 * call degrades to a no-op/undefined if IndexedDB is unavailable, so the KB still
 * works (on the capped snapshot text) without it.
 */
const DB_NAME = 'erp-cowork-kb'
const STORE = 'blobs'
const VERSION = 1

export interface KbBlobRecord {
  id: string
  fileName: string
  mime: string
  text?: string          // full extracted text (uncapped)
  dataUrl?: string        // raw file as a data: URL, for preview/download
  thumbUrl?: string       // small visual thumbnail (image itself, or rendered PDF page 1)
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

export async function putBlob(rec: KbBlobRecord): Promise<void> {
  const db = await idb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(rec)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function getBlob(id: string): Promise<KbBlobRecord | undefined> {
  const db = await idb()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result as KbBlobRecord | undefined)
      req.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await idb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
