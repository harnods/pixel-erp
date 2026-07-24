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
  /** navigate() label (module route), when no explicit create path. */
  to?: string
  /** explicit route path — leaf create pages (e.g. New product). */
  path?: string
  visible: boolean
}

const KEY = 'quick-shortcuts'

// Default order + visibility. Hidden ones are off until the user enables them.
const DEFAULTS: QuickShortcut[] = [
  { key: 'sales-invoice',     label: 'Sales invoice',     to: 'Sales invoices',    visible: true },
  { key: 'sales-order',       label: 'Sales order',       to: 'Sales orders',      visible: true },
  { key: 'sales-quote',       label: 'Sales quote',       to: 'Sales quotes',      visible: false },
  { key: 'purchase-invoice',  label: 'Purchase invoice',  to: 'Purchase invoices', visible: false },
  { key: 'purchase-order',    label: 'Purchase order',    to: 'Purchase orders',   visible: true },
  { key: 'expenses',          label: 'Expenses',          to: 'Expenses',          visible: true },
  { key: 'upload-bill',       label: 'Upload bill',       to: 'Upload bill',       visible: false },
  { key: 'product',           label: 'Product',           path: '/product-list/new', visible: true },
  { key: 'journal-entry',     label: 'Journal entry',     to: 'Journal entries',   visible: false },
  { key: 'internal-transfer', label: 'Internal transfer', to: 'Internal transfer', visible: false },
  { key: 'receive-money',     label: 'Receive money',     to: 'Receive money',     visible: false },
  { key: 'spend-money',       label: 'Spend money',       to: 'Spend money',       visible: false },
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

export function toggleShortcut(key: string): void {
  const s = quickShortcuts.find((x) => x.key === key)
  if (s) { s.visible = !s.visible; persist() }
}

/** Move a shortcut from index `from` to index `to` (drag-and-drop reorder). */
export function reorderShortcuts(from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= quickShortcuts.length || to >= quickShortcuts.length) return
  const [moved] = quickShortcuts.splice(from, 1)
  quickShortcuts.splice(to, 0, moved!)
  persist()
}
