/**
 * Buzz image store — AI-generated asset images kept out of localStorage (which
 * only holds the capped asset metadata snapshot) so the quota isn't blown by
 * large base64 images. Backed by IndexedDB; every call degrades to a no-op /
 * undefined if IndexedDB is unavailable. Mirrors app/utils/kbBlobStore.ts.
 */
const DB_NAME = 'erp-buzz-images'
const STORE = 'images'
const VERSION = 1

export interface BuzzImageRecord {
  id: string
  mime: string
  dataUrl: string       // full generated image as a data: URL
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

export async function putImage(rec: BuzzImageRecord): Promise<void> {
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

export async function getImage(id: string): Promise<BuzzImageRecord | undefined> {
  const db = await idb()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result as BuzzImageRecord | undefined)
      req.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

export async function deleteImage(id: string): Promise<void> {
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
