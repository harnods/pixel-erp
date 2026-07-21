<template>
  <div class="sidebar-wrapper">
    <!-- Main nav (52px collapsed, 216px expanded) -->
    <nav class="sidebar" :class="{ 'is-expanded': navExpanded, 'arrow-left': arrowPointsLeft }" aria-label="Main navigation">
      <!-- Toggle -->
      <div class="sidebar-header">
        <button class="sidebar-toggle" @click="handleToggle" title="Toggle sidebar">
          <img :src="toggleIcon" alt="Toggle sidebar" />
        </button>
      </div>

      <!-- Nav groups -->
      <div v-for="(group, gi) in navGroups" :key="gi" class="nav-group">
        <button
          v-for="item in group"
          :key="item.name"
          class="nav-item"
          :class="{ active: activeItem === item.name }"
          :title="item.name"
          @click="() => handleNavClick(item)"
          @mouseenter="(e) => handleItemMouseEnter(e, item)"
          @mouseleave="scheduleClose"
        >
          <img :src="`https://cdn.mekari.design/icons/${item.icon}-outline.svg`" class="nav-icon-line" alt="" />
          <img :src="`https://cdn.mekari.design/icons/${item.icon}-fill.svg`" class="nav-icon-fill" alt="" />
          <span class="nav-label">{{ item.name }}</span>
        </button>
      </div>
    </nav>

    <!-- Secondary sidebar panel -->
    <Transition name="panel">
      <div v-if="activePanel && isPanelVisible" class="sidebar-panel">
        <div class="panel-header">
          <span class="panel-title">{{ activePanel.title.toUpperCase() }}</span>
        </div>
        <div class="panel-list">
          <template v-for="(group, gi) in activePanel.groups" :key="gi">
            <div v-if="gi > 0" class="panel-divider" />
            <button
              v-for="sub in group"
              :key="sub.label"
              class="panel-item"
              :class="{ active: activePanelSubItem === sub.label }"
              @click="handlePanelSubItemClick(sub)"
            >
              <span>{{ sub.label }}</span>
              <span v-if="sub.count != null" class="panel-item-count">{{ sub.count }}</span>
              <img
                v-else-if="sub.iconType === 'shortcut'"
                :src="shortcutIcon"
                class="panel-item-icon"
                alt=""
              />
            </button>
          </template>
        </div>
      </div>
    </Transition>
  </div>

  <!-- Flyout popover -->
  <Teleport to="body">
    <div
      v-if="flyoutItem"
      class="submenu-flyout"
      :style="flyoutStyle"
      @mouseenter="cancelClose"
      @mouseleave="scheduleClose"
    >
      <template v-for="(group, gi) in flyoutItem.submenu" :key="gi">
        <div class="submenu-group" :class="{ 'has-border': gi < (flyoutItem.submenu?.length ?? 0) - 1 }">
          <button
            v-for="sub in group"
            :key="sub.label"
            class="submenu-item"
            @click="handleFlyoutSubItemClick(sub)"
          >
            <span>{{ sub.label }}</span>
            <img v-if="sub.iconType === 'shortcut'" :src="shortcutIcon" class="submenu-item-icon submenu-item-icon--shortcut" alt="" />
            <img v-else-if="sub.iconType === 'settings'" :src="settingsIcon" class="submenu-item-icon" alt="" />
          </button>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import toggleIconUrl from '~/assets/images/sidebar-toggle.svg?url'
import shortcutIconUrl from '~/assets/images/shortcut-icon.svg?url'
import { receiptCountsByStage } from '~/data/receipts'
import { receivingOpenCount } from '~/data/receivingTasks'
import { putAwayOpenCount } from '~/data/putAwayTasks'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PanelSubItem {
  label: string
  iconType?: 'shortcut' | 'settings'
  /**
   * Navigation identity (page label) when it must differ from the display label —
   * e.g. a Settings sub-item "Inventory" routes to its own page, not the top-level
   * "Inventory" list. Defaults to `label`.
   */
  to?: string
  /** Task-count indicator shown right-aligned (e.g. items awaiting action). */
  count?: number
}

// Level-2 flyout item. If panelSubmenu is set, clicking it opens a level-3 panel.
interface SubItem {
  label: string
  iconType?: 'shortcut' | 'settings'
  panelSubmenu?: PanelSubItem[][]
  /** Override panel title. Defaults to parent nav item name. */
  panelTitle?: string
}

interface NavItem {
  name: string
  icon: string
  /** Level-2 flyout (hover) */
  submenu?: SubItem[][]
  /** Level-2 panel opened directly by clicking the nav item (e.g. Reports) */
  panelSubmenu?: PanelSubItem[][]
  /**
   * Explicit destination path for a leaf item, when it shouldn't route to its own
   * slug — e.g. WMS Ops "Warehouses" opens a specific warehouse's detail directly.
   */
  path?: string
}

interface ActivePanel {
  /** Title shown at the top of the panel (uppercase) */
  title: string
  /** Grouped items */
  groups: PanelSubItem[][]
  /** Which nav item should appear active while this panel is open */
  parentNavName: string
}

// ─── State ───────────────────────────────────────────────────────────────────

// Rail expand/collapse is a user preference — persist it so a refresh doesn't
// silently collapse a rail the user explicitly expanded.
const SIDEBAR_EXPANDED_KEY = 'erp-sidebar-expanded'
function loadSidebarExpanded(): boolean {
  if (!import.meta.client) return false
  try { return localStorage.getItem(SIDEBAR_EXPANDED_KEY) === '1' } catch { return false }
}
function saveSidebarExpanded(v: boolean): void {
  if (!import.meta.client) return
  try { localStorage.setItem(SIDEBAR_EXPANDED_KEY, v ? '1' : '0') } catch { /* ignore */ }
}

const isExpanded = ref(loadSidebarExpanded())
const isPanelVisible = ref(true)
const activeItem = ref('Home')
const activePanel = ref<ActivePanel | null>(null)
const activePanelSubItem = ref<string | null>(null)

const toggleIcon = toggleIconUrl
const shortcutIcon = shortcutIconUrl
const settingsIcon = 'https://cdn.mekari.design/icons/settings-outline.svg'

const { navigate, currentPageKey, setActiveMenuLabel, activeSectionOverride } = useNavigation()
const router = useRouter()

const flyoutItem = ref<NavItem | null>(null)
const flyoutStyle = ref<Record<string, string>>({})
let closeTimer: ReturnType<typeof setTimeout> | null = null

// ─── Computed ─────────────────────────────────────────────────────────────────

// Main nav collapses while a panel is open
const navExpanded = computed(() => isExpanded.value && !activePanel.value)
// Arrow points left when nav is expanded OR when a panel is visible
const arrowPointsLeft = computed(() => navExpanded.value || (!!activePanel.value && isPanelVisible.value))

// ─── Nav data ────────────────────────────────────────────────────────────────

// Settings level-2 panel — shared so WMS Standalone shows the same Settings list as ERP.
const settingsPanelSubmenu: PanelSubItem[][] = [
  [
    { label: 'Company profile' },
    { label: 'Users & roles' },
    { label: 'Billing' },
  ],
  [
    { label: 'Sales' },
    { label: 'Purchases' },
    { label: 'Inventory' },
    { label: 'Warehouses', to: 'Warehouse settings' },
    { label: 'Production' },
    { label: 'Default accounts' },
  ],
  [
    { label: 'Templates' },
    { label: 'Custom fields' },
    { label: 'Approval workflows' },
    { label: 'Tagging rules' },
  ],
  [
    { label: 'Tax rates' },
    { label: 'Currencies' },
    { label: 'Payment terms' },
    { label: 'Payment methods' },
    { label: 'Tags' },
  ],
]

// Settings level-2 panel for WMS Standalone — a trimmed, warehouse-focused list.
const wmsSettingsPanelSubmenu: PanelSubItem[][] = [
  [
    { label: 'Company profile' },
    { label: 'Users & roles' },
    { label: 'Billing' },
  ],
  [
    { label: 'Inventory', to: 'Inventory settings' },
    { label: 'Warehouse', to: 'Warehouse settings' },
    { label: 'Storage locations' },
  ],
]

const erpNavGroups: NavItem[][] = [
  [
    { name: 'Home', icon: 'home' },
    {
      name: 'Reports', icon: 'reports',
      panelSubmenu: [[
        { label: 'Financials' },
        { label: 'Sales' },
        { label: 'Purchases' },
        { label: 'Inventory' },
        { label: 'Tax' },
        { label: 'Cash & bank' },
        { label: 'Production' },
        { label: 'Fixed assets' },
      ]],
    },
    {
      name: 'Accounting', icon: 'chart-of-account',
      submenu: [
        [
          { label: 'Cash management' },
          { label: 'Reconciliations' },
          { label: 'Consolidation' },
          { label: 'Chart of accounts' },
          { label: 'Close books' },
          { label: 'Fixed assets' },
          { label: 'Bank rules' },
        ],
        [{ label: 'Accounting settings', iconType: 'settings' }],
      ],
    },
  ],
  [
    {
      name: 'Sales', icon: 'sales',
      submenu: [
        [
          { label: 'Sales invoices' },
          { label: 'Sales deliveries' },
          { label: 'Sales orders' },
          { label: 'Sales quotes' },
        ],
        [
          { label: 'Customers', iconType: 'shortcut' },
          { label: 'Sales reports', iconType: 'shortcut' },
          { label: 'Sales settings', iconType: 'settings' },
        ],
      ],
    },
    {
      name: 'Purchases', icon: 'cart',
      submenu: [
        [
          { label: 'Purchase invoices' },
          { label: 'Purchase deliveries' },
          { label: 'Purchase orders' },
          { label: 'Purchase quotes' },
          { label: 'Purchase requests' },
        ],
        [
          { label: 'Vendors', iconType: 'shortcut' },
          { label: 'Purchase reports', iconType: 'shortcut' },
          { label: 'Purchase settings', iconType: 'settings' },
        ],
      ],
    },
    { name: 'Expenses', icon: 'expenses' },
  ],
  [
    {
      name: 'Inventory', icon: 'products',
      submenu: [
        [
          {
            label: 'Products',
            panelSubmenu: [
              [
                { label: 'Products', to: 'Product list' },
                { label: 'Categories' },
                { label: 'Variant options' },
                { label: 'Units' },
                { label: 'Price rules' },
              ],
              [
                { label: 'Stock adjustments', iconType: 'shortcut' },
              ],
            ],
          },
          { label: 'Cost recalculation' },
        ],
        [
          { label: 'Products reports', iconType: 'shortcut' },
          { label: 'Inventory settings', iconType: 'settings' },
        ],
      ],
    },
    {
      name: 'WMS', icon: 'warehouse',
      submenu: [
        [
          { label: 'Overview' },
          { label: 'Warehouses' },
          { label: 'Outbound delivery' },
          { label: 'Inbound delivery' },
          { label: 'Warehouse transfers' },
          { label: 'Stock adjustments' },
        ],
        [
          { label: 'Storage locations' },
          { label: 'Warehouse reports', iconType: 'shortcut' },
          { label: 'Warehouse settings', iconType: 'settings' },
        ],
      ],
    },
    {
      name: 'Production', icon: 'fulfillment',
      submenu: [
        [{ label: 'Production plans' }, { label: 'Production request' }, { label: 'Work orders' }, { label: 'Bill of materials' }],
        [{ label: 'Production reports', iconType: 'shortcut' }, { label: 'Production settings', iconType: 'settings' }],
      ],
    },
  ],
  [
    {
      name: 'Contacts', icon: 'contact',
      submenu: [
        [
          {
            label: 'Customers',
            panelSubmenu: [[
              { label: 'Customers' },
              { label: 'Contact groups' },
            ]],
          },
          {
            label: 'Vendors',
            panelSubmenu: [[
              { label: 'Vendors' },
              { label: 'Contact groups' },
            ]],
          },
          {
            label: 'Employees',
            panelSubmenu: [[
              { label: 'Employees' },
              { label: 'Contact groups' },
            ]],
          },
          {
            label: 'Other contacts',
            panelSubmenu: [[
              { label: 'Other contacts' },
              { label: 'Contact groups' },
            ]],
          },
        ],
      ],
    },
    {
      name: 'Integrations', icon: 'connected_apps',
      submenu: [[
        { label: 'Omnichannel commerce', iconType: 'shortcut' },
        { label: 'CRM', iconType: 'shortcut' },
        { label: 'HR & Payroll', iconType: 'shortcut' },
        { label: 'e-Signature', iconType: 'shortcut' },
        { label: 'Tax' },
        { label: 'Mekari Pay' },
        { label: 'Mekari Expense', iconType: 'shortcut' },
      ]],
    },
    {
      name: 'Other lists', icon: 'table-view-list',
      submenu: [[
        { label: 'Recurring transactions' }, { label: 'Tax rates' }, { label: 'Currencies' },
        { label: 'Payment terms' }, { label: 'Payment methods' }, { label: 'Tags' },
        { label: 'Export & import' }, { label: 'File manager' }, { label: 'Activity log' },
        { label: 'Data migration' },
      ]],
    },
    {
      name: 'Settings', icon: 'settings',
      panelSubmenu: settingsPanelSubmenu,
    },
  ],
]

// Shared WMS nav items (reused across WMS scenarios).
const barangKeluarNav: NavItem = {
  name: 'Outbound delivery', icon: 'sales',
  panelSubmenu: [[
    { label: 'Orders', count: 8 },
    { label: 'Picking', count: 6 },
    { label: 'Packing', count: 4 },
    { label: 'Ready to ship', count: 2 },
    { label: 'Delivery' },
    { label: 'Voided orders' },
  ]],
}
// Barang masuk nav — counts derive live from receipt data (warehouse-scoped),
// so panel badges match what the table shows. Standalone adds Draft; Ops doesn't.
function barangMasukNavItem(scopeIds: string[] | undefined, withDraft: boolean): NavItem {
  const c = receiptCountsByStage(scopeIds)
  const items: PanelSubItem[] = []
  if (withDraft) items.push({ label: 'Draft' })
  items.push({ label: 'On the way', count: c['On the way'] })
  items.push({ label: 'Receiving', count: receivingOpenCount(scopeIds) || undefined })
  items.push({ label: 'Put-away', count: putAwayOpenCount(scopeIds) || undefined })
  items.push({ label: 'Partial reception', count: c['Partial reception'] })
  items.push({ label: 'Completed', to: 'Inbound completed' })
  items.push({ label: 'Canceled' })
  return { name: 'Inbound delivery', icon: 'cart', panelSubmenu: [items] }
}
const stockCountNav: NavItem[] = [
  { name: 'Stock count', icon: 'table-view-list' },
  { name: 'Cycle counts', icon: 'chart-of-account' },
  { name: 'Stock in/out', icon: 'fulfillment' },
]

const { activeWarehouse, assignedWarehouses } = useWarehouseContext()
const assignedWarehouseIds = computed(() => assignedWarehouses.value.map(w => w.id))

// WMS Standalone nav — full WMS menu (all warehouses). Warehouses → existing index.
// Barang Masuk and Barang Keluar navigate directly (no level-2 panel); tabs inside
// the page handle Receipts / Receiving / Put-away and Orders / Picking / etc.
const wmsStandaloneNavGroups = computed<NavItem[][]>(() => [
  [
    { name: 'Home', icon: 'home' },
    { name: 'Reports', icon: 'reports' },
  ],
  [
    { name: 'Inventory', icon: 'products' },
    { name: 'Warehouses', icon: 'warehouse' },
  ],
  [
    { name: 'Outbound delivery', icon: 'sales' },
    { name: 'Inbound delivery', icon: 'cart' },
  ],
  [
    {
      name: 'Stock adjustments', icon: 'table-view-list',
      panelSubmenu: [[
        { label: 'Cycle counts' },
        { label: 'Stock counts' },
      ]],
    },
  ],
  [
    { name: 'Settings', icon: 'settings', panelSubmenu: wmsSettingsPanelSubmenu },
  ],
])

// WMS Ops — trimmed menu scoped to the user's assigned warehouse(s). The
// fulfillment group depends on what the active warehouse handles (out / in);
// Barang masuk counts are scoped to the assigned warehouses.
const wmsOpsNavGroups = computed<NavItem[][]>(() => {
  const flows = activeWarehouse.value?.flows ?? ['out']
  const fulfillment: NavItem[] = []
  if (flows.includes('out')) fulfillment.push({ name: 'Outbound delivery', icon: 'sales' })
  if (flows.includes('in')) fulfillment.push({ name: 'Inbound delivery', icon: 'cart' })
  return [
    [{ name: 'Home', icon: 'home' }],
    [{ name: 'Warehouses', icon: 'warehouse', path: `/warehouses/${activeWarehouse.value?.id ?? 'wh-001'}` }],
    fulfillment,
    stockCountNav,
  ]
})

// Active scenario drives which nav is shown. WMS Ops + Ops 2 share the trimmed
// Ops menu; WMS Standalone uses the full WMS nav; ERP uses the ERP nav.
const { activeScenario } = useScenario()
const navGroups = computed<NavItem[][]>(() => {
  if (activeScenario.value === 'WMS Ops' || activeScenario.value === 'WMS Ops 2') return wmsOpsNavGroups.value
  if (activeScenario.value.startsWith('WMS')) return wmsStandaloneNavGroups.value
  return erpNavGroups
})

// ─── Sync active state from the route ──────────────────────────────────────────
//
// Active highlight is URL-driven so it survives a refresh (this is an SPA —
// ssr:false). Resolve the current page label back to its top-level nav item +
// sub-item; first match wins (primary nav group is iterated first).

// Resolve a page label back to its nav item + sub-item, and — when the match
// lives inside a level-2 panel — the panel that should be open. Returning the
// panel lets us restore it on refresh (otherwise the panel only ever opens via
// a click handler, so a hard reload on a panel sub-page would lose it).
// A `shortcut`-flagged panel item (e.g. Inventory > Products > "Stock
// adjustments") is a pointer INTO another section's real page, not an owner of
// its own — e.g. WMS's own "Stock adjustments" shares that exact label. Search
// non-shortcut items first so the real owning section (WMS) always wins the
// sidebar highlight, regardless of which of the two identically-labeled items
// was actually clicked; only fall back to a shortcut match if nothing else
// claims the label (so standalone shortcuts, e.g. "Products reports", still work).
function findActive(pageKey: string, allowShortcuts: boolean): {
  nav: string
  sub: string | null
  panel: ActivePanel | null
} | null {
  for (const group of navGroups.value) {
    for (const item of group) {
      // slug-based match so names with caps/slashes (e.g. 'Stock in/out') still
      // resolve through the URL round-trip
      if (labelToPath(item.name) === labelToPath(pageKey)) {
        // If the matched nav item owns a level-2 panel, return it so the panel
        // stays open on refresh of a detail page (e.g. /stock-adjustments/wsa-001
        // resolves to 'Stock adjustments', which has a panelSubmenu).
        const panel = item.panelSubmenu
          ? { title: item.name, groups: item.panelSubmenu, parentNavName: item.name }
          : null
        return { nav: item.name, sub: null, panel }
      }
      for (const subGroup of item.submenu ?? []) {
        for (const sub of subGroup) {
          if (sub.label === pageKey) return { nav: item.name, sub: sub.label, panel: null }
          for (const pGroup of sub.panelSubmenu ?? []) {
            for (const p of pGroup) {
              if (!allowShortcuts && p.iconType === 'shortcut') continue
              if (labelToPath(p.to ?? p.label) === labelToPath(pageKey)) {
                return {
                  nav: item.name,
                  sub: p.label,
                  // level-3 panel opened from a flyout sub-item (e.g. Products)
                  panel: {
                    title: sub.panelTitle ?? item.name,
                    groups: sub.panelSubmenu!,
                    parentNavName: item.name,
                  },
                }
              }
            }
          }
        }
      }
      for (const pGroup of item.panelSubmenu ?? []) {
        for (const p of pGroup) {
          if (!allowShortcuts && p.iconType === 'shortcut') continue
          if (labelToPath(p.to ?? p.label) === labelToPath(pageKey)) {
            return {
              nav: item.name,
              sub: p.label,
              // level-2 panel opened directly from the nav item (e.g. Settings, Reports)
              panel: { title: item.name, groups: item.panelSubmenu!, parentNavName: item.name },
            }
          }
        }
      }
    }
  }
  return null
}

function resolveActive(pageKey: string): {
  nav: string
  sub: string | null
  panel: ActivePanel | null
} {
  return findActive(pageKey, false) ?? findActive(pageKey, true) ?? { nav: 'Home', sub: null, panel: null }
}

// Map URL-first-segment keys that don't appear directly in the nav tree to their
// parent section. Used as a fallback when resolveActive returns Home so that
// detail pages (e.g. receiving task detail in ERP scenario) don't snap the
// sidebar away from the relevant section.
const SECTION_PARENT: Record<string, string> = {
  Picking: 'Outbound delivery',
  Packing: 'Outbound delivery',
  Delivery: 'Outbound delivery',
  Receiving: 'Inbound delivery',
  'Put away': 'Inbound delivery',
}

watch([currentPageKey, activeSectionOverride], ([urlKey, override]) => {
  const key = override ?? urlKey
  let { nav, sub, panel } = resolveActive(key)
  // When the URL key isn't in this scenario's nav tree, try the canonical parent
  // section instead so the sidebar stays anchored (and the level-2 panel stays open).
  if (nav === 'Home' && key !== 'Home') {
    const parentKey = SECTION_PARENT[key]
    if (parentKey) ({ nav, sub, panel } = resolveActive(parentKey))
  }
  activeItem.value = nav
  // On a detail route the first URL segment matches the parent nav item directly
  // (sub === null). Keep the last active sub-item so the level-2 panel highlight
  // doesn't disappear while the user is inside a detail page of that section.
  // On a hard refresh sub is null, so we restore from localStorage (keyed per
  // nav section). If nothing is stored yet, fall back to the first panel item.
  const sameSection = activePanel.value?.parentNavName === nav || panel?.parentNavName === nav
  if (sub !== null) {
    activePanelSubItem.value = sub
    setActiveMenuLabel(sub)
    try { localStorage.setItem(`erp-panel-sub:${nav}`, sub) } catch { /* ignore */ }
  } else if (sameSection) {
    let restored: string | null = null
    try { restored = localStorage.getItem(`erp-panel-sub:${nav}`) } catch { /* ignore */ }
    const fallback = panel?.groups?.[0]?.[0]?.label ?? null
    const chosen = restored ?? fallback
    if (chosen) {
      activePanelSubItem.value = chosen
      setActiveMenuLabel(chosen)
    }
  } else {
    activePanelSubItem.value = null
    setActiveMenuLabel(nav)
  }
  // Keep the level-2 panel in sync with the URL so it survives a refresh.
  if (panel) {
    activePanel.value = panel
    isPanelVisible.value = true
    isExpanded.value = false
  } else if (sameSection) {
    isPanelVisible.value = true
  } else {
    activePanel.value = null
  }
}, { immediate: true })

// Switching scenario swaps the whole nav — close any open ERP panel/flyout and
// collapse the rail so we don't show stale level-2/3 content from the old menu.
watch(activeScenario, () => {
  closePanel()
  flyoutItem.value = null
  isExpanded.value = false
})

// ─── Handlers ────────────────────────────────────────────────────────────────

function openPanel(panel: ActivePanel) {
  activePanel.value = panel
  isPanelVisible.value = true
  isExpanded.value = false
}

function closePanel() {
  activePanel.value = null
  activePanelSubItem.value = null
}

function handleToggle() {
  if (activePanel.value) {
    isPanelVisible.value = !isPanelVisible.value
  } else {
    isExpanded.value = !isExpanded.value
    saveSidebarExpanded(isExpanded.value)
  }
}

function handleNavClick(item: NavItem) {
  flyoutItem.value = null

  if (item.panelSubmenu) {
    // Nav item that directly opens a panel (e.g. Reports)
    if (activePanel.value?.parentNavName === item.name) {
      // Clicking same item again — close panel
      closePanel()
      activeItem.value = ''
    } else {
      const firstItem = item.panelSubmenu[0][0]
      openPanel({ title: item.name, groups: item.panelSubmenu, parentNavName: item.name })
      activePanelSubItem.value = firstItem.label
      navigate(firstItem.to ?? firstItem.label)
      activeItem.value = item.name
    }
  } else if (!item.submenu) {
    // Simple leaf nav item (e.g. Home, Expenses, Settings)
    activeItem.value = item.name
    if (item.path) router.push(item.path)
    else navigate(item.name)
    closePanel()
  }
  // Items with submenu: flyout opens on hover, click does nothing
}

function handlePanelSubItemClick(sub: PanelSubItem) {
  activePanelSubItem.value = sub.label
  navigate(sub.to ?? sub.label)
}

function handleFlyoutSubItemClick(sub: SubItem) {
  const parentName = flyoutItem.value!.name
  flyoutItem.value = null

  if (sub.panelSubmenu) {
    // Level-2 item that opens a level-3 panel — auto-select first panel item
    const panelTitle = sub.panelTitle ?? parentName
    const firstItem = sub.panelSubmenu[0][0]
    openPanel({ title: panelTitle, groups: sub.panelSubmenu, parentNavName: parentName })
    activePanelSubItem.value = firstItem.label
    navigate(firstItem.to ?? firstItem.label)
    activeItem.value = parentName
  } else {
    // Regular level-2 item — navigate directly, close any open panel
    activeItem.value = parentName
    navigate(sub.label)
    closePanel()
  }
}

function handleItemMouseEnter(e: MouseEvent, item: NavItem) {
  if (!item.submenu) {
    scheduleClose()
    return
  }
  cancelClose()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  flyoutItem.value = item
  flyoutStyle.value = {
    top: `${rect.top}px`,
    left: `${rect.right + 8}px`,
  }
}

function scheduleClose() {
  closeTimer = setTimeout(() => { flyoutItem.value = null }, 150)
}

function cancelClose() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
}
</script>

<style scoped>
.sidebar-wrapper {
  display: flex;
  height: 100%;
  flex-shrink: 0;
}

.sidebar {
  width: 52px;                        /* custom — not in token scale */
  background: var(--mp-background-neutral-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1);
  will-change: width;
  padding: 0 var(--mp-spacing-2) var(--mp-spacing-2);
}

.sidebar.is-expanded { width: 216px; }  /* custom — not in token scale */

.sidebar-header {
  display: flex;
  align-items: center;
  height: 72px;                       /* custom — not in token scale */
  flex-shrink: 0;
}

.sidebar-toggle {
  width: var(--mp-sizes-9);
  height: var(--mp-sizes-9);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  background: transparent;
  border: none;
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-1);
  flex-shrink: 0;
  transition: background-color 100ms;
}

.sidebar-toggle:hover { background-color: var(--mp-background-neutral-subtle-hovered); }

.sidebar-toggle img {
  width: var(--mp-sizes-6);
  height: var(--mp-sizes-6);
  display: block;
  flex-shrink: 0;
  filter: brightness(0) opacity(0.6);
  transform: scaleX(-1);
  transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar.is-expanded .sidebar-toggle img,
.sidebar.arrow-left .sidebar-toggle img { transform: scaleX(1); }

.nav-group {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
  padding-bottom: var(--mp-spacing-2);
  margin-bottom: var(--mp-spacing-1);
  border-bottom: 1px solid var(--mp-border-default);
}

.nav-group:last-child { border-bottom: none; }

.nav-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;   /* constant — avoids icon snap on collapse;
                                    icon stays centred in the 36px rail via padding */
  gap: var(--mp-spacing-2);
  width: var(--mp-sizes-9);
  height: var(--mp-sizes-9);
  border-radius: var(--mp-radii-md);
  border: none;
  background: transparent;
  cursor: pointer;
  padding: var(--mp-spacing-2);
  overflow: hidden;
  transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1), background-color 100ms;
}

.sidebar.is-expanded .nav-item {
  width: 100%;
}

.nav-item:hover { background-color: var(--mp-background-neutral-subtle-hovered); }
.nav-item:hover img { filter: brightness(0) saturate(100%) invert(26%) sepia(60%) saturate(600%) hue-rotate(185deg) brightness(85%) contrast(95%); }
.nav-item:hover .nav-label { color: var(--mp-text-link, #165082); }

.nav-item.active { background-color: var(--mp-background-neutral-pressed); }
.nav-item.active .nav-icon-line { display: none; }
.nav-item .nav-icon-fill { display: none; }
.nav-item.active .nav-icon-fill {
  display: block;
  filter: brightness(0) saturate(100%) invert(35%) sepia(55%) saturate(700%) hue-rotate(120deg) brightness(90%) contrast(100%);
}
.nav-item.active .nav-label { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link, #165082); }

.nav-item img {
  width: var(--mp-sizes-5);
  height: var(--mp-sizes-5);
  display: block;
  flex-shrink: 0;
  pointer-events: none;
}

.nav-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  opacity: 0;
  overflow: hidden;
  white-space: nowrap;
  pointer-events: none;
  /* opacity-only fade; the rail's width animation + overflow:hidden clip the text
     (animating max-width is not smooth) */
  transition: opacity 140ms ease;
}

.sidebar.is-expanded .nav-label { opacity: 1; }

/* ── Secondary sidebar panel ── */
.sidebar-panel {
  width: 188px;               /* custom — not in token scale */
  background: var(--mp-background-neutral-subtle);
  height: 100%;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 0 var(--mp-spacing-2) var(--mp-spacing-2);
}

.panel-header {
  height: 72px;               /* custom — not in token scale */
  display: flex;
  align-items: center;
  padding: 0 var(--mp-spacing-2);
  flex-shrink: 0;
}

.panel-title {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  letter-spacing: 2.88px;    /* custom — token letter-spacing are em-based */
  color: var(--mp-text-default);
}

.panel-list {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
}

.panel-divider {
  height: 1px;               /* custom — intentional 1px divider */
  background: var(--mp-border-default);
  margin: var(--mp-spacing-1) 0;
}

.panel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  width: 100%;
  padding: var(--mp-spacing-2);
  border-radius: var(--mp-radii-md);
  border: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  cursor: pointer;
  text-align: left;
  line-height: var(--mp-line-heights-md);
  transition: background-color 100ms;
}

.panel-item:hover { background-color: var(--mp-background-neutral-subtle-hovered); }

.panel-item.active {
  background-color: #E2E8F0;
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-link, #165082);
}

.panel-item-icon {
  width: var(--mp-sizes-4);
  height: var(--mp-sizes-4);
  flex-shrink: 0;
  filter: brightness(0) opacity(0.5);
}

/* Task-count indicator — right-aligned pill */
.panel-item-count {
  flex-shrink: 0;
  min-width: var(--mp-sizes-5);
  padding: 0 var(--mp-spacing-1\.5);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-pressed);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 24px);
  color: var(--mp-text-secondary);
  text-align: center;
}

.panel-item.active .panel-item-count {
  background: var(--mp-background-brand, var(--mp-text-selected));
  color: var(--mp-text-inverse, #fff);
}

/* Slide-in transition */
.panel-enter-active,
.panel-leave-active {
  transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease;
  overflow: hidden;
}

.panel-enter-from,
.panel-leave-to {
  width: 0;
  opacity: 0;
}

.panel-enter-to,
.panel-leave-from {
  width: 188px;
  opacity: 1;
}
</style>

<style>
.submenu-flyout {
  position: fixed;
  z-index: 1000;
  width: 188px;
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  box-shadow: var(--mp-shadows-sm);
  padding: var(--mp-spacing-2) 0;
  font-family: var(--mp-fonts-body);
}

.submenu-group { display: flex; flex-direction: column; }

.submenu-group.has-border {
  border-bottom: 1px solid var(--mp-border-default);
  padding-bottom: var(--mp-spacing-2);
}

.submenu-group + .submenu-group { padding-top: var(--mp-spacing-2); }

.submenu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  text-align: left;
  line-height: var(--mp-line-heights-md);
  transition: background-color 100ms;
}

.submenu-item:hover { background-color: var(--mp-background-neutral-subtle-hovered); }

.submenu-item-icon { width: var(--mp-sizes-5); height: var(--mp-sizes-5); flex-shrink: 0; filter: brightness(0) opacity(0.5); }
.submenu-item-icon--shortcut { width: var(--mp-sizes-4); height: var(--mp-sizes-4); }
</style>
