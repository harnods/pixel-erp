/**
 * erpSitemap — the app's full navigation sitemap plus per-page BUILT / NOT-BUILT
 * coverage, powering the internal /design-erp coverage dashboard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COVERAGE SOURCE OF TRUTH → `BUILT_KEYS` (below).
 *
 * A sitemap leaf is "Built" when its resolved page key is in `BUILT_KEYS`. The
 * key is resolved exactly the way the runtime resolves it: pathToLabel(labelToPath(
 * to ?? label)) — the same URL round-trip `useNavigation` performs. A key is in
 * BUILT_KEYS when a real (non-Placeholder) component serves it, i.e. it is:
 *   • a key in `pageRegistry`            (app/pages/[...slug].vue), or
 *   • a `tabComponents` key              (tab-served index pages), or
 *   • reachable through a `detailMatch`  (detail/flow pages).
 *
 * HOW TO UPDATE WHEN A PAGE SHIPS:
 *   1. Register the page in `pageRegistry` (or wire it into tabComponents/
 *      detailMatch) in app/pages/[...slug].vue.
 *   2. Add its resolved key to `BUILT_KEYS` here. That's the only edit coverage
 *      needs — every summary/count recomputes from this set.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { labelToPath, pathToLabel } from '~/composables/useNavigation'

/** Per-action build status: a real route/wired handler, a UI-only no-op, or absent. */
export type ActionStatus = 'built' | 'partial' | 'missing'

/** One CRUD/lifecycle action of an entity (New, Details, Edit, Archive, Delete, …). */
export interface EntityAction {
  label: string
  status: ActionStatus
  /** Optional clarification (e.g. "bulk only", "overlay, no URL", "→ placeholder"). */
  note?: string
}

export interface SitemapNode {
  /** Display label as it appears in the sidebar. */
  label: string
  /** Resolved page-registry lookup key (pathToLabel(labelToPath(to ?? label))). */
  key: string
  /** Kebab-case route the leaf navigates to. */
  route: string
  /** True when a real component serves `key` (see BUILT_KEYS). */
  built: boolean
  /** Nested stage/section pages (e.g. Inbound delivery → Receiving). */
  children?: SitemapNode[]
  /** Free-text clarification (e.g. how an ambiguously-routed page is served). */
  note?: string
  /** Per-entity CRUD/lifecycle action coverage (only on entities with a built page). */
  actions?: EntityAction[]
}

export interface SitemapModule {
  module: string
  items: SitemapNode[]
}

/**
 * Resolved page keys that a real component serves. Keys are the URL round-trip
 * form (pathToLabel(labelToPath(...))), NOT the raw sidebar labels — e.g. the
 * "Put-away" leaf resolves to "Put away" (the hyphen is dropped by the slug
 * round-trip), so that is the string listed here.
 */
export const BUILT_KEYS = new Set<string>([
  // ── pageRegistry index pages (URL-reachable) ──
  'Home',
  'Cash management',
  'Sales invoices',
  'Sales deliveries',
  'Sales orders',
  'Sales quotes',
  'Purchase invoices',
  'Purchase orders',
  'Product list',
  'Warehouses',
  'Storage locations',
  'Couriers',
  'Warehouse transfers',
  'Stock adjustments',
  'Cycle counts',
  'Work orders',
  'Bill of materials',
  'Company profile',
  'Warehouse settings',
  'Mekari pay',
  'Wms report',
  // Real components that were previously under-reported by this set:
  'Data migration', // pageRegistry (DataMigrationPage) + /data-migration/wms-cutover/* flow
  'Crm',            // detailMatch /crm → CrmDealsPage
  'Dashboard',      // served by the WMS-overview tab set (tabComponents['Dashboard'])
  // Inbound stages (registry keys / to-targets)
  'On the way',
  'Receiving',
  'Partial reception',
  'Inbound completed',
  'Canceled',
  // PutAwayIndexPage exists and serves the Inbound delivery › Put-away tab and
  // the /put-away/:id detail route; the "Put-away" leaf resolves to "Put away".
  'Put away',

  // ── tabComponents index pages ──
  'Overview',
  'Inbound delivery',
  'Outbound delivery',
  'Expenses',
  'Production request',

  // ── Outbound stages (served by the Outbound delivery tab set / detail routes) ──
  'Orders',        // Requests tab (OutgoingIndexPage) + /outbound-delivery/:id
  'Picking',       // Picking tab (PickingIndexPage) + /picking/:id
  'Packing',       // Packing tab (PackingIndexPage) + /packing/:id
  'Ready to ship', // Ready to ship tab (DeliveryIndexPage)
  'Delivery',      // /delivery/:id (DeliveryTaskDetailsPage) + shipping docs
])

/**
 * Resolve a leaf's page key the same way the router does (URL round-trip).
 * Exposed so the dashboard and tests classify keys identically.
 */
export function resolveKey(label: string, to?: string): string {
  return pathToLabel(labelToPath(to ?? label))
}

/** Compact action builder. */
function a(label: string, status: ActionStatus, note?: string): EntityAction {
  return note ? { label, status, note } : { label, status }
}

/**
 * Per-entity CRUD / lifecycle ACTION coverage, keyed by the entity's display
 * label. Only entities that have a built page get an entry — placeholder
 * entities (Contacts, most Settings, most Reports, …) stay a single Not-built
 * row. Derived from a full source audit (Aug 2026); update alongside the code.
 */
const ACTIONS: Record<string, EntityAction[]> = {
  // ── Accounting ──
  'Cash management': [
    a('New', 'built'), a('Details', 'built'), a('Edit', 'built'), a('Archive', 'built'), a('Delete', 'built'),
    a('Import statement', 'built'), a('Reconcile', 'partial', 'entry points wired; toggle is a mock toast'),
    a('New transaction', 'partial', 'dropdown items no-op'),
  ],
  // ── Sales ──
  'Sales invoices': [
    a('New', 'built'), a('Details', 'built'), a('Edit', 'partial', 'menu item no-op; no /edit route'),
    a('Archive', 'missing'), a('Delete', 'built', 'bulk only; row kebab is a dead button'),
    a('Duplicate', 'partial'), a('Export', 'partial'), a('Submit to DJP', 'built'),
  ],
  'Sales orders': [
    a('New', 'partial', 'title button has no @click'), a('Details', 'built'), a('Edit', 'partial'),
    a('Archive', 'missing'), a('Delete', 'partial'), a('Duplicate', 'partial'), a('Void', 'partial'),
    a('Create production request', 'built'),
  ],
  'Sales quotes': [
    a('New', 'partial'), a('Details', 'missing', 'no /:id route'), a('Edit', 'missing'),
    a('Archive', 'missing'), a('Delete', 'missing'), a('Duplicate', 'partial'),
  ],
  'Sales deliveries': [
    a('New', 'partial'), a('Details', 'missing', 'no /:id route'), a('Edit', 'missing'),
    a('Archive', 'missing'), a('Delete', 'missing'),
  ],
  // ── Purchases ──
  'Purchase invoices': [
    a('New', 'partial', 'title button no @click'), a('Details', 'missing', 'only OCR review route'),
    a('Edit', 'missing'), a('Archive', 'missing'), a('Delete', 'partial', 'dead kebab button'),
    a('Import', 'partial'), a('Review files (OCR)', 'built'),
  ],
  'Purchase orders': [
    a('New', 'built', 'overlay, no URL'), a('Details', 'built', 'overlay, no URL'), a('Edit', 'partial'),
    a('Archive', 'missing'), a('Delete', 'partial'), a('Approve', 'built'), a('Reject', 'built'),
    a('Duplicate', 'built'), a('Void', 'partial'), a('Send to fulfillment', 'built'),
  ],
  // ── Expenses ──
  'Expenses': [
    a('New', 'built'), a('Details', 'built'), a('Edit', 'built'), a('Archive', 'missing'),
    a('Delete', 'built'), a('Duplicate', 'built'), a('Add payment', 'built'), a('Approve', 'built'),
    a('Import', 'partial', 'Upload bills wired; others no-op'), a('Payment details', 'partial', '→ placeholder'),
  ],
  // ── Inventory ──
  'Products': [
    a('New', 'built'), a('Details', 'built'), a('Edit', 'built'), a('Archive', 'partial', 'menu item no-op'),
    a('Delete', 'missing'), a('Duplicate', 'partial'), a('Import', 'partial'), a('Export', 'built'),
    a('Print barcode', 'built'),
  ],
  // ── Production ──
  'Production request': [
    a('Details', 'partial', 'preview drawer, no /:id'), a('Create work order', 'built'),
    a('Reject', 'built'), a('Export', 'partial'),
  ],
  'Work orders': [
    a('New', 'built'), a('Details', 'built'), a('Edit', 'partial'), a('Archive', 'missing'),
    a('Delete', 'partial'), a('Duplicate', 'partial'), a('Cancel', 'partial'), a('Export', 'partial'),
  ],
  'Bill of materials': [
    a('New', 'built'), a('Details', 'built'), a('Edit', 'built'), a('Archive', 'built'),
    a('Delete', 'partial', 'aliased to Archive'), a('Duplicate', 'built'), a('Create work order', 'built'),
    a('Print', 'partial'), a('Export', 'partial'),
  ],
  // ── WMS master data ──
  'Warehouses': [
    a('New', 'built'), a('Import', 'built'), a('Details', 'built'), a('Edit', 'built'), a('Configure', 'built'),
    a('Archive', 'built'), a('Unarchive', 'built'), a('Delete', 'partial', 'modal never mutates data'),
    a('Export', 'built'),
  ],
  'Storage locations': [
    a('Add', 'built'), a('Details', 'built'), a('Edit', 'built'), a('Delete', 'built'),
  ],
  'Couriers': [
    a('Add', 'built'), a('Edit', 'built'), a('Delete', 'built'),
  ],
  'Warehouse transfers': [
    a('New', 'built'), a('Details', 'built'), a('Edit', 'built'), a('Duplicate', 'built'),
    a('Approve', 'built'), a('Cancel', 'built'), a('Import', 'partial'),
  ],
  'Stock adjustments': [
    a('New', 'built'), a('Details', 'built'), a('Edit', 'partial', '→ placeholder'),
    a('Approve', 'built'), a('Cancel', 'built'),
  ],
  // ── WMS outbound stages ──
  'Orders': [a('New', 'built'), a('Details', 'built'), a('Edit', 'built'), a('Cancel', 'built')],
  'Picking': [a('Create', 'built'), a('Details', 'built'), a('Start / Pick', 'built'), a('Cancel', 'built')],
  'Packing': [a('Create', 'built'), a('Details', 'built'), a('Start / Pack', 'built'), a('Cancel', 'built'), a('Print labels', 'built')],
  'Ready to ship': [a('Details', 'built'), a('Handover to courier', 'built'), a('New shipment', 'built'), a('Complete shipment', 'built')],
  'Delivery': [a('Details', 'built'), a('Handover to courier', 'built'), a('Shipment detail', 'built'), a('Complete shipment', 'built')],
  // ── WMS inbound stages ──
  'On the way': [
    a('New', 'built'), a('Details', 'built'), a('Edit', 'built'), a('Close', 'built'),
    a('Cancel', 'built'), a('Delete', 'built', 'manual receipts'), a('Import', 'partial'),
  ],
  'Receiving': [a('Create task', 'built'), a('Details', 'built'), a('Start', 'built'), a('Receive / End', 'built'), a('Cancel', 'built')],
  'Put-away': [a('Create', 'built'), a('Details', 'built'), a('Start', 'built'), a('Store / End', 'built'), a('Cancel', 'built')],
  'Cycle counts': [
    a('New task', 'built'), a('Details', 'built'), a('Count', 'built'), a('Start / Close', 'built'),
    a('Edit', 'partial', '→ placeholder'), a('Recommendations', 'built'),
  ],
  'Stock inout': [a('Index', 'built'), a('Create', 'built')],
  // ── Reports ──
  'WMS': [a('Index', 'built'), a('Details', 'built'), a('Export', 'built')],
}

/** Build a leaf node, resolving its route, key, and built-status in one place. */
function leaf(label: string, opts: { to?: string; note?: string; children?: SitemapNode[] } = {}): SitemapNode {
  const key = resolveKey(label, opts.to)
  return {
    label,
    key,
    route: labelToPath(opts.to ?? label),
    built: BUILT_KEYS.has(key),
    ...(opts.children ? { children: opts.children } : {}),
    ...(opts.note ? { note: opts.note } : {}),
    ...(ACTIONS[label] ? { actions: ACTIONS[label] } : {}),
  }
}

export const SITEMAP: SitemapModule[] = [
  {
    module: 'General',
    items: [
      leaf('Home'),
      leaf('Dashboard'),
    ],
  },
  {
    module: 'Reports',
    items: [
      leaf('Financials', { to: 'Financial report' }),
      leaf('Sales', { to: 'Sales report' }),
      leaf('Purchases', { to: 'Purchase report' }),
      leaf('Inventory', { to: 'Inventory report' }),
      leaf('WMS', { to: 'WMS report', note: 'Reports › WMS index (four report cards); detail tables via /wms-report/:slug.' }),
      leaf('Tax', { to: 'Tax report' }),
      leaf('Cash & bank', { to: 'Cash & bank report' }),
      leaf('Production', { to: 'Production report' }),
      leaf('Fixed assets', { to: 'Fixed assets report' }),
    ],
  },
  {
    module: 'Accounting',
    items: [
      leaf('Cash management'),
      leaf('Reconciliations'),
      leaf('Consolidation'),
      leaf('Chart of accounts'),
      leaf('Close books'),
      leaf('Fixed assets', {
        note: 'Accordion header (no page of its own) — expands to its children.',
        children: [
          leaf('Assets'),
          leaf('Depreciation schedule'),
        ],
      }),
      leaf('Bank rules'),
      leaf('Accounting settings'),
    ],
  },
  {
    module: 'Sales',
    items: [
      leaf('Sales invoices'),
      leaf('Sales deliveries'),
      leaf('Sales orders'),
      leaf('Sales quotes'),
    ],
  },
  {
    module: 'Purchases',
    items: [
      leaf('Purchase invoices'),
      leaf('Purchase deliveries'),
      leaf('Purchase orders'),
      leaf('Purchase quotes'),
      leaf('Purchase requests'),
    ],
  },
  {
    module: 'Expenses',
    items: [
      leaf('Expenses'),
    ],
  },
  {
    module: 'Inventory',
    items: [
      leaf('Products', { to: 'Product list' }),
      leaf('Categories'),
      leaf('Variant options'),
      leaf('Units'),
      leaf('Price rules'),
    ],
  },
  {
    module: 'WMS',
    items: [
      leaf('Overview'),
      leaf('Warehouses'),
      leaf('Outbound delivery', {
        note: 'Tab-based page (Requests / Picking / Packing / Shipping / Shipping documents).',
        children: [
          leaf('Orders'),
          leaf('Picking'),
          leaf('Packing'),
          leaf('Ready to ship'),
          leaf('Delivery'),
          leaf('Voided orders'),
        ],
      }),
      leaf('Inbound delivery', {
        note: 'Tab-based page (Receipts / Receiving / Put-away).',
        children: [
          leaf('Draft'),
          leaf('On the way'),
          leaf('Receiving'),
          leaf('Put-away', { note: 'Served by the Put-away tab and /put-away/:id; bare /put-away slug falls to placeholder.' }),
          leaf('Partial reception'),
          leaf('Completed', { to: 'Inbound completed' }),
          leaf('Canceled'),
        ],
      }),
      leaf('Warehouse transfers'),
      leaf('Stock adjustments'),
      leaf('Cycle counts'),
      leaf('Storage locations'),
      leaf('Couriers'),
    ],
  },
  {
    module: 'Production',
    items: [
      leaf('Production plans'),
      leaf('Production request'),
      leaf('Work orders'),
      leaf('Bill of materials'),
    ],
  },
  {
    module: 'Contacts',
    items: [
      leaf('Customers'),
      leaf('Vendors'),
      leaf('Employees'),
      leaf('Other contacts'),
      leaf('Contact groups'),
    ],
  },
  {
    module: 'Integrations',
    items: [
      leaf('Omnichannel commerce'),
      leaf('CRM'),
      leaf('HR & Payroll'),
      leaf('e-Signature'),
      leaf('Mekari Pay'),
      leaf('Mekari Expense'),
    ],
  },
  {
    module: 'Other lists',
    items: [
      leaf('Recurring transactions'),
      leaf('Activity log'),
      leaf('Export & import'),
      leaf('File manager'),
      leaf('Cost recalculation'),
    ],
  },
  {
    module: 'Settings',
    items: [
      leaf('Company profile'),
      leaf('Users & roles'),
      leaf('Billing'),
      leaf('Sales settings'),
      leaf('Purchase settings'),
      leaf('Inventory settings'),
      leaf('Warehouse settings'),
      leaf('Production settings'),
      leaf('Default accounts'),
      leaf('Templates'),
      leaf('Custom fields'),
      leaf('Approval workflows'),
      leaf('Tagging rules'),
      leaf('Tax rates'),
      leaf('Currencies'),
      leaf('Payment terms'),
      leaf('Payment methods'),
      leaf('Tags'),
      leaf('Data migration'),
    ],
  },
]

/** Flatten every node (parents + children) into one list. */
export function flattenSitemap(): SitemapNode[] {
  const out: SitemapNode[] = []
  const walk = (nodes: SitemapNode[]) => {
    for (const n of nodes) {
      out.push(n)
      if (n.children) walk(n.children)
    }
  }
  for (const m of SITEMAP) walk(m.items)
  return out
}

export interface SitemapSummary {
  total: number
  built: number
  notBuilt: number
  /** Percent built, 0–100, rounded to a whole number. */
  pct: number
}

/** App-wide coverage totals (every leaf, parents + children). */
export function sitemapSummary(): SitemapSummary {
  const all = flattenSitemap()
  const total = all.length
  const built = all.filter((n) => n.built).length
  const notBuilt = total - built
  return { total, built, notBuilt, pct: total ? Math.round((built / total) * 100) : 0 }
}

export interface ModuleSummary extends SitemapSummary {
  module: string
}

/** Per-module built/total counts. */
export function moduleSummaries(): ModuleSummary[] {
  return SITEMAP.map((m) => {
    const nodes: SitemapNode[] = []
    const walk = (list: SitemapNode[]) => list.forEach((n) => { nodes.push(n); if (n.children) walk(n.children) })
    walk(m.items)
    const total = nodes.length
    const built = nodes.filter((n) => n.built).length
    return { module: m.module, total, built, notBuilt: total - built, pct: total ? Math.round((built / total) * 100) : 0 }
  })
}

/** App-wide ACTION coverage — every EntityAction across every leaf. */
export function actionSummary(): { total: number; built: number; partial: number; missing: number } {
  let built = 0, partial = 0, missing = 0
  for (const n of flattenSitemap()) {
    for (const act of n.actions ?? []) {
      if (act.status === 'built') built++
      else if (act.status === 'partial') partial++
      else missing++
    }
  }
  return { total: built + partial + missing, built, partial, missing }
}
