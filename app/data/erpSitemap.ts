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
  'Stock counts',
  'Work orders',
  'Bill of materials',
  'Company profile',
  'Warehouse settings',
  'Mekari pay',
  'Wms report',
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
      leaf('Stock adjustments', {
        children: [
          leaf('Cycle counts'),
          leaf('Stock counts'),
        ],
      }),
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
