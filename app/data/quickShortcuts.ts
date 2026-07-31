/**
 * Config for the header quick-create ("+") shortcut menu: which shortcuts show,
 * and in what order. The order + visibility is user-editable (drag to reorder,
 * toggle show/hide via the "Shortcut visibility" view) and persisted like the rest
 * of the prototype's mini-DB (survives refresh; cleared by Reset demo data).
 *
 * Only the { key, visible } order is persisted — labels/routes always come from
 * DEFAULTS below, so they stay improvable in code and new shortcuts merge in.
 */
import { reactive, computed } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

export interface QuickShortcut {
  key: string
  label: string
  /** Route to the creation page. '#' = no creation page in the prototype yet (no-op). */
  path: string
  visible: boolean
}

const KEY = 'quick-shortcuts'

// Default order + visibility. Each points at its creation page where the prototype
// has one; the rest are '#' (placeholder, no navigation) until those pages exist.
const DEFAULTS: QuickShortcut[] = [
  { key: 'sales-invoice',     label: 'Sales invoice',     path: '#', visible: true },
  { key: 'sales-order',       label: 'Sales order',       path: '#', visible: true },
  { key: 'sales-quote',       label: 'Sales quote',       path: '#', visible: false },
  { key: 'purchase-invoice',  label: 'Purchase invoice',  path: '#', visible: false },
  { key: 'purchase-order',    label: 'Purchase order',    path: '#', visible: true },
  { key: 'expenses',          label: 'Expenses',          path: '#', visible: true },
  { key: 'upload-bill',       label: 'Upload bill',       path: '#', visible: false },
  { key: 'product',           label: 'Product',           path: '/product-list/new', visible: true },
  { key: 'journal-entry',     label: 'Journal entry',     path: '#', visible: false },
  { key: 'internal-transfer', label: 'Internal transfer', path: '#', visible: false },
  { key: 'receive-money',     label: 'Receive money',     path: '#', visible: false },
  { key: 'spend-money',       label: 'Spend money',       path: '#', visible: false },
]

function build(): QuickShortcut[] {
  const saved = loadSnapshot<{ key: string; visible: boolean }>(KEY)
  if (!saved?.length) return DEFAULTS.map((s) => ({ ...s }))
  const byKey = new Map(DEFAULTS.map((d) => [d.key, d]))
  const out: QuickShortcut[] = []
  const seen = new Set<string>()
  for (const s of saved) {
    const d = byKey.get(s.key)
    if (d) { out.push({ ...d, visible: s.visible }); seen.add(s.key) }
  }
  // Merge in any shortcuts added to DEFAULTS after this snapshot was saved.
  for (const d of DEFAULTS) if (!seen.has(d.key)) out.push({ ...d })
  return out
}

export const quickShortcuts = reactive<QuickShortcut[]>(build())

function persist() {
  saveSnapshot(KEY, quickShortcuts.map((s) => ({ key: s.key, visible: s.visible })))
}

/** Shortcuts shown in the main "+" menu — visible ones, in the saved order. */
export const visibleShortcuts = computed(() => quickShortcuts.filter((s) => s.visible))

// How many shortcuts can be shown at once.
export const MAX_VISIBLE = 6
export const MIN_VISIBLE = 1

export type ToggleResult = { ok: true } | { ok: false; reason: 'max' | 'min' }

/** Toggle a shortcut's visibility, enforcing the visible-count bounds
 *  (min 1, max 6). Returns why it was blocked so the caller can explain. */
export function toggleShortcut(key: string): ToggleResult {
  const s = quickShortcuts.find((x) => x.key === key)
  if (!s) return { ok: false, reason: 'min' }
  const visibleCount = quickShortcuts.filter((x) => x.visible).length
  if (s.visible) {
    if (visibleCount <= MIN_VISIBLE) return { ok: false, reason: 'min' } // keep at least one
    s.visible = false
  } else {
    if (visibleCount >= MAX_VISIBLE) return { ok: false, reason: 'max' } // no more than six
    s.visible = true
  }
  persist()
  return { ok: true }
}

/** Move a shortcut from index `from` to index `to` (drag-and-drop reorder). */
export function reorderShortcuts(from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= quickShortcuts.length || to >= quickShortcuts.length) return
  const [moved] = quickShortcuts.splice(from, 1)
  quickShortcuts.splice(to, 0, moved!)
  persist()
}
