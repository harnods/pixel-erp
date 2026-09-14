/**
 * Tiny keyed-object store for the replenishment modules.
 *
 * `persist.ts` covers ARRAY-shaped tables. The replenishment stores are keyed
 * objects (settings maps, config, the run ledger), so they need a different shape.
 *
 * Two tiers, and the memory tier is not just for tests: the engine READS these
 * stores, so where `localStorage` is unavailable (SSR, a spec, a private window with
 * site data blocked) a localStorage-only implementation would silently fall back to
 * defaults and quietly report different numbers than the browser does. Mirroring to
 * memory keeps a single run coherent either way.
 *
 * Module-level memory would leak between requests in a real multi-tenant SSR app.
 * Acceptable here: this prototype is a client-rendered SPA whose data is per-browser
 * mock data anyway (see the localStorage note in README).
 */
import { ref } from 'vue'

const memory = new Map<string, unknown>()

/**
 * Bumped whenever anything the replenishment engine reads is written — settings,
 * config, tracking flags, a recalculation.
 *
 * Needed because the engine's entry points are plain FUNCTIONS over localStorage,
 * not reactive state, so a `computed` that calls `replenishmentDueCount()` has no
 * dependency to invalidate. Without this the tab-count badges silently go stale the
 * first time a user mutes a product — they showed 17 while the list held 18.
 */
export const replenishmentRevision = ref(0)

export function bumpReplenishmentRevision(): void {
  replenishmentRevision.value++
}

export function readStore<T>(key: string, fallback: T): T {
  if (memory.has(key)) return memory.get(key) as T
  if (!import.meta.client) return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    memory.set(key, parsed)
    return parsed
  } catch {
    return fallback
  }
}

export function writeStore<T>(key: string, value: T): void {
  memory.set(key, value)
  bumpReplenishmentRevision()
  if (!import.meta.client) return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota — non-fatal for a prototype */ }
}

export function clearStore(key: string): void {
  memory.delete(key)
  bumpReplenishmentRevision()
  if (!import.meta.client) return
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}
