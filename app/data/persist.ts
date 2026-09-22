/**
 * Tiny localStorage-backed persistence for the prototype's "dummy database".
 *
 * The deterministic seed data is always regenerated fresh on load; only
 * USER-CREATED records are persisted here and merged on top of the seed. That
 * keeps the seed improvable (no drift) while letting things you create —
 * receivings, put-aways, receipts — survive a page refresh, a closed tab, or a
 * browser restart. Nothing ever resets on its own; call resetDb() to wipe it.
 */
const PREFIX = 'erp-db:'

/** Load the list of user-created records for a store (empty before any exist). */
export function loadCreated<T>(key: string): T[] {
  if (!import.meta.client) return []
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

/** Persist the list of user-created records for a store. */
export function saveCreated<T>(key: string, items: T[]): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(items))
  } catch {
    /* quota / serialization errors are non-fatal for a prototype */
  }
}

/**
 * Snapshot persistence — stores a WHOLE entity array (seed + user edits + created).
 * Used by the inbound graph (receipts / receiving tasks / put-aways) where seed
 * records are mutated (start/end receiving, status derivation), not just appended.
 * On load, a present snapshot wins over the freshly-generated seed; reset clears it.
 */
export function loadSnapshot<T>(key: string): T[] | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T[]) : null
  } catch {
    return null
  }
}

export function saveSnapshot<T>(key: string, items: T[]): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(items))
  } catch {
    /* non-fatal for a prototype */
  }
}

/**
 * Flag persistence — a single boolean under the same prefix, so "Reset demo
 * data" (resetDb) clears it along with everything else. Used for one-way
 * tenant-level switches like activating Dimensions, which must survive a
 * refresh but should come back off after a reset.
 */
export function loadFlag(key: string): boolean {
  if (!import.meta.client) return false
  try {
    return localStorage.getItem(PREFIX + key) === 'true'
  } catch {
    return false
  }
}

export function saveFlag(key: string, value: boolean): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(PREFIX + key, String(value))
  } catch {
    /* non-fatal for a prototype */
  }
}

/** Wipe every store's created records, returning the app to its seed data. */
export function resetDb(): void {
  if (!import.meta.client) return
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k))
}
