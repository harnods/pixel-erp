/**
 * Config for the Home "quick actions" shortcut row (the pills under the greeting)
 * and the "Add actions" manage modal. The user picks up to 6 actions (min 1) from
 * a fixed catalog and drags to reorder them; the selection is persisted like the
 * rest of the prototype's mini-DB (survives refresh; cleared by Reset demo data).
 *
 * Only the ordered list of selected keys is persisted — labels/icons/routes always
 * come from HOME_ACTION_CATALOG below, so they stay improvable in code and new
 * catalog entries merge in without touching a saved selection.
 *
 * Mirrors the header quick-create store in ./quickShortcuts.ts (same persist
 * mechanism + min/max bounds), kept separate because it's a different surface.
 */
import { reactive, computed } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

export interface HomeActionDef {
  key: string
  label: string
  /** MpIcon name for the home pill. */
  icon: string
  /** Route to open when the pill is clicked. '#' = no page in the prototype yet. */
  path: string
}

const KEY = 'home-actions'

export const MAX_ACTIONS = 6
export const MIN_ACTIONS = 1

/**
 * The full catalog, in the order it appears in the modal's "Action list" column.
 * Icon names verified against Pixel (get-icon-name).
 */
export const HOME_ACTION_CATALOG: HomeActionDef[] = [
  { key: 'new-sales-invoice',     label: 'New sales invoice',     icon: 'sales',            path: '/sales-invoices' },
  { key: 'new-sales-order',       label: 'New sales order',       icon: 'sales',            path: '/sales-orders' },
  { key: 'new-sales-quote',       label: 'New sales quote',       icon: 'sales',            path: '#' },
  { key: 'new-sales-delivery',    label: 'New sales delivery',    icon: 'sales',            path: '#' },
  { key: 'new-purchase-request',  label: 'New purchase request',  icon: 'cart',             path: '#' },
  { key: 'new-purchase-quote',    label: 'New purchase quote',    icon: 'cart',             path: '#' },
  { key: 'new-purchase-order',    label: 'New purchase order',    icon: 'cart',             path: '#' },
  { key: 'new-purchase-invoice',  label: 'New purchase invoice',  icon: 'cart',             path: '/purchase-invoices' },
  { key: 'new-purchase-delivery', label: 'New purchase delivery', icon: 'cart',             path: '#' },
  { key: 'new-expense',           label: 'New expense',           icon: 'expenses',         path: '#' },
  { key: 'new-transfer-money',    label: 'New transfer money',    icon: 'bank',             path: '#' },
  { key: 'new-receive-money',     label: 'New receive money',     icon: 'bank',             path: '#' },
  { key: 'reconcile-bank',        label: 'Reconcile bank',        icon: 'bank',             path: '#' },
  { key: 'run-consolidation',     label: 'Run consolidation',     icon: 'reports',          path: '#' },
  { key: 'new-product',           label: 'New product',           icon: 'products',         path: '/product-list/new' },
  { key: 'new-warehouse',         label: 'New warehouse',         icon: 'warehouse',        path: '#' },
  { key: 'new-stock-inout',       label: 'New stock In/out',      icon: 'warehouse',        path: '#' },
  { key: 'new-warehouse-transfer',label: 'New warehouse transfer',icon: 'warehouse',        path: '#' },
  { key: 'new-customer',          label: 'New customer',          icon: 'partner',          path: '#' },
  { key: 'new-vendor',            label: 'New vendor',            icon: 'partner',          path: '#' },
  { key: 'new-employee',          label: 'New employee',          icon: 'employee',         path: '#' },
  { key: 'view-general-ledger',   label: 'View general ledger',   icon: 'chart-of-account', path: '#' },
  { key: 'view-balance-sheet',    label: 'View balance sheet',    icon: 'chart-bar',        path: '#' },
  { key: 'view-pnl',              label: 'View profit and loss report', icon: 'reports',    path: '#' },
]

const byKey = new Map(HOME_ACTION_CATALOG.map((a) => [a.key, a]))
export function homeActionByKey(key: string): HomeActionDef | undefined { return byKey.get(key) }

/** Selection shown on Home, in order. Defaults mirror the original hard-coded pills. */
const DEFAULT_SELECTED = [
  'new-sales-invoice',
  'new-sales-order',
  'new-purchase-invoice',
  'new-expense',
  'view-pnl',
  'reconcile-bank',
]

function build(): string[] {
  const saved = loadSnapshot<string>(KEY)
  if (saved?.length) {
    const valid = saved.filter((k) => byKey.has(k)).slice(0, MAX_ACTIONS)
    if (valid.length >= MIN_ACTIONS) return valid
  }
  return [...DEFAULT_SELECTED]
}

export const selectedActionKeys = reactive<string[]>(build())

function persist() { saveSnapshot(KEY, [...selectedActionKeys]) }

/** Catalog defs for the selected keys, in order — what the Home pills render from. */
export const selectedActions = computed<HomeActionDef[]>(() =>
  selectedActionKeys.map((k) => byKey.get(k)).filter((a): a is HomeActionDef => !!a),
)

/**
 * Replace the whole selection (called by the "Add actions" modal on Save).
 * Silently clamps to the catalog + MAX; ignores an empty selection so Home never
 * ends up with zero pills.
 */
export function setSelectedActions(keys: string[]): void {
  const valid: string[] = []
  const seen = new Set<string>()
  for (const k of keys) {
    if (byKey.has(k) && !seen.has(k)) { valid.push(k); seen.add(k) }
    if (valid.length >= MAX_ACTIONS) break
  }
  if (valid.length < MIN_ACTIONS) return
  selectedActionKeys.splice(0, selectedActionKeys.length, ...valid)
  persist()
}
