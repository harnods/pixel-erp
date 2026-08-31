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
          :class="{ active: activeItem === item.name, 'is-flyout-open': flyoutItem?.name === item.name }"
          :title="t(item.name)"
          @click="() => handleNavClick(item)"
          @mouseenter="(e) => handleItemMouseEnter(e, item)"
          @mouseleave="scheduleClose"
        >
          <img :src="`https://cdn.mekari.design/icons/${item.iconLine ?? item.icon + '-outline'}.svg`" class="nav-icon-line" alt="" />
          <img :src="`https://cdn.mekari.design/icons/${item.iconFill ?? item.icon + '-fill'}.svg`" class="nav-icon-fill" alt="" />
          <span class="nav-label">{{ t(item.name) }}</span>
        </button>
      </div>
    </nav>

    <!-- Secondary sidebar panel (hidden on narrow viewports to free content width) -->
    <Transition name="panel">
      <div v-if="activePanel && isPanelVisible && !isNarrowViewport" class="sidebar-panel">
        <div class="panel-header">
          <span class="panel-title">{{ t(activePanel.title).toUpperCase() }}</span>
        </div>
        <div class="panel-list">
          <template v-for="(group, gi) in activePanel.groups" :key="gi">
            <div v-if="gi > 0" class="panel-divider" />
            <template v-for="sub in group" :key="sub.label">
              <!-- Accordion item (e.g. Fixed assets): expandable header + children -->
              <template v-if="sub.children">
                <button
                  class="panel-item panel-item--accordion"
                  :class="{ 'is-open': isAccordionOpen(sub) }"
                  @click="handlePanelAccordionClick(sub)"
                >
                  <span>{{ t(sub.label) }}</span>
                  <svg class="panel-accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <button
                  v-for="child in sub.children"
                  v-show="isAccordionOpen(sub)"
                  :key="child.label"
                  class="panel-item panel-item--child"
                  :class="{ active: activePanelSubItem === child.label }"
                  @click="handlePanelSubItemClick(child)"
                >
                  <span>{{ t(child.label) }}</span>
                  <MpBadge v-if="child.count != null" class="panel-item-count" for="additionalInformation" type="warning" size="sm">{{ child.count }}</MpBadge>
                </button>
              </template>
              <!-- Plain item -->
              <button
                v-else
                class="panel-item"
                :class="{ active: activePanelSubItem === sub.label }"
                @click="handlePanelSubItemClick(sub)"
              >
                <span>{{ t(sub.label) }}</span>
                <MpBadge v-if="sub.count != null" class="panel-item-count" for="additionalInformation" type="warning" size="sm">{{ sub.count }}</MpBadge>
                <img
                  v-else-if="sub.iconType === 'shortcut'"
                  :src="shortcutIcon"
                  class="panel-item-icon"
                  alt=""
                />
                <img
                  v-else-if="sub.iconType === 'settings'"
                  :src="settingsIcon"
                  class="panel-item-icon panel-item-icon--settings"
                  alt=""
                />
              </button>
            </template>
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
      <template v-for="(group, gi) in flyoutGroups" :key="gi">
        <div class="submenu-group" :class="{ 'has-border': gi < flyoutGroups.length - 1 }">
          <button
            v-for="sub in group"
            :key="sub.label"
            class="submenu-item"
            :class="{ active: activePanelSubItem === sub.label }"
            @click="handleFlyoutSubItemClick(sub)"
          >
            <span>{{ t(sub.label) }}</span>
            <img v-if="sub.iconType === 'shortcut'" :src="shortcutIcon" class="submenu-item-icon submenu-item-icon--shortcut" alt="" />
            <img v-else-if="sub.iconType === 'settings'" :src="settingsIcon" class="submenu-item-icon" alt="" />
          </button>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { MpIcon, MpBadge } from '@mekari/pixel3'
import toggleIconUrl from '~/assets/images/sidebar-toggle.svg?url'
import shortcutIconUrl from '~/assets/images/shortcut-icon.svg?url'
import { receiptCountsByStage } from '~/data/receipts'
import { receivingOpenCount } from '~/data/receivingTasks'
import { putAwayOpenCount } from '~/data/putAwayTasks'
import { awaitingApprovalGroupCounts, awaitingApprovalTasks } from '~/data/tasks'

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
  /** Explicit destination path (overrides label-based routing) — e.g. WMS
   *  Standalone report items routing to /wms-report/<slug>. */
  path?: string
  /** Task-count indicator shown right-aligned (e.g. items awaiting action). */
  count?: number
  /** Inline accordion inside the level-2 panel: this item becomes an expandable
   *  header whose children render indented below it. The accordion is closed by
   *  default and only expands while one of its children is the active page (e.g.
   *  Accounting › Fixed assets → Assets / Depreciation schedule). Clicking the
   *  header lands on the first child. */
  children?: PanelSubItem[]
  /** Cross-section shortcut: jump to another nav's panel item (e.g. a module's
   *  "reports" shortcut opening Reports › Sales) instead of navigating in place. */
  shortcutTo?: { nav: string; sub: string }
}

// Level-2 flyout item. If panelSubmenu is set, clicking it opens a level-3 panel.
interface SubItem {
  label: string
  iconType?: 'shortcut' | 'settings'
  /** Inline accordion children promoted into the level-2 panel (see
   *  PanelSubItem.children) — carried through expandGroupsFor. */
  children?: PanelSubItem[]
  panelSubmenu?: PanelSubItem[][]
  /** Override panel title. Defaults to parent nav item name. */
  panelTitle?: string
  /** Navigation identity (page label), when it differs from the display label. */
  to?: string
  /** Cross-section shortcut: jump to another nav's panel item (e.g. Reports › Sales). */
  shortcutTo?: { nav: string; sub: string }
}

interface NavItem {
  name: string
  icon: string
  /** Explicit CDN icon filenames (without .svg) — use when the line/fill pair
   *  doesn't follow the `${icon}-outline` / `${icon}-fill` convention. */
  iconLine?: string
  iconFill?: string
  /** Level-2 flyout (hover) */
  submenu?: SubItem[][]
  /** Level-2 panel opened directly by clicking the nav item (e.g. Reports) */
  panelSubmenu?: PanelSubItem[][]
  /**
   * Panel menus (panelSubmenu) open on click with no hover preview by default —
   * like Inventory and Settings. Set this so hovering ALSO shows a flyout of the
   * panel items (e.g. Reports); clicking a flyout item opens the full panel with
   * that item selected. Opt-in, so Inventory/Settings stay click-only.
   */
  flyoutOnHover?: boolean
  /**
   * When set, clicking ANY flyout item (that doesn't already have its own
   * nested panelSubmenu) promotes it into a persistent level-2 panel instead
   * of just navigating — same panel UI as Reports. While that panel is open,
   * hovering this nav item no longer reopens the flyout (see
   * handleItemMouseEnter).
   *   - `true`  — panel content mirrors this item's own `submenu` verbatim.
   *   - array   — an explicit, custom panel content list (e.g. Inventory
   *               consolidates its nested "Products" panel into this
   *               top-level one instead of mirroring the flyout as-is).
   */
  expandOnClick?: boolean | PanelSubItem[][]
  /**
   * Explicit destination path for a leaf item, when it shouldn't route to its own
   * slug — e.g. WMS Ops "Warehouses" opens a specific warehouse's detail directly.
   */
  path?: string
  /**
   * Navigation identity (page label) when it must differ from the display name —
   * e.g. WMS Standalone's "Products" leaf routes to the "Product list" page.
   * Defaults to `name`.
   */
  to?: string
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
// Which accordion (e.g. Fixed assets) the user has manually expanded in the
// level-2 panel. Closed by default; toggled purely by clicking the header — it
// never navigates on its own. (An accordion also shows open whenever one of its
// children is the active page — see isAccordionOpen.)
const expandedAccordion = ref<string | null>(null)

const toggleIcon = toggleIconUrl
const shortcutIcon = shortcutIconUrl
const settingsIcon = 'https://cdn.mekari.design/icons/settings-outline.svg'

const { navigate, currentPageKey, setActiveMenuLabel, activeSectionOverride } = useNavigation()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

// Inbox level-2 panel — reached from the header notification icon (not the nav
// tree). Its tabs route via ?tab= so the page key stays 'Inbox' (same pattern as
// the Reports panel, but query-driven since it's a single page). "Awaiting
// approval" is a non-clickable, always-expanded parent — only its per-category
// children (counts live from awaitingApprovalGroupCounts) are navigable.
const inboxPanelSubmenu = computed<PanelSubItem[][]>(() => {
  const counts = awaitingApprovalGroupCounts()
  return [[
    { label: 'Notifications', path: '/inbox?tab=notifications' },
    {
      label: 'Awaiting approval',
      children: [
        { label: 'All', path: '/inbox?tab=awaiting-approval&innerTab=all', count: awaitingApprovalTasks.length || undefined },
        { label: 'Sales', path: '/inbox?tab=awaiting-approval&innerTab=sales', count: counts.sales || undefined },
        { label: 'Purchases', path: '/inbox?tab=awaiting-approval&innerTab=purchases', count: counts.purchases || undefined },
        { label: 'Expenses', path: '/inbox?tab=awaiting-approval&innerTab=expenses', count: counts.expenses || undefined },
        { label: 'Products', path: '/inbox?tab=awaiting-approval&innerTab=products', count: counts.products || undefined },
        { label: 'Warehouse', path: '/inbox?tab=awaiting-approval&innerTab=warehouse', count: counts.warehouse || undefined },
      ],
    },
  ]]
})

const flyoutItem = ref<NavItem | null>(null)
const flyoutStyle = ref<Record<string, string>>({})
let closeTimer: ReturnType<typeof setTimeout> | null = null

// ─── Computed ─────────────────────────────────────────────────────────────────

// Below tablet width the expanded nav (216px) starves the content area, so we
// force the collapsed icon rail there regardless of the saved preference.
const isNarrowViewport = ref(false)
if (import.meta.client) {
  const mq = window.matchMedia('(max-width: 1024px)')
  isNarrowViewport.value = mq.matches
  mq.addEventListener('change', (e) => { isNarrowViewport.value = e.matches })
}

// Some full-bleed pages render their OWN level-2 sidemenu inside the content area
// (e.g. XPM Accounts → the wallet list). Force the main nav to the icon rail there
// so the two level-2 columns don't stack side by side.
const hasOwnLevel2 = computed(() => route.path === '/accounts' || route.path.startsWith('/accounts/'))
// Main nav collapses while a panel is open, on narrow viewports, or on a page that
// owns its own level-2 sidemenu.
const navExpanded = computed(() => isExpanded.value && !activePanel.value && !isNarrowViewport.value && !hasOwnLevel2.value)
// Arrow points left when nav is expanded OR when a panel is visible
const arrowPointsLeft = computed(() => navExpanded.value || (!!activePanel.value && isPanelVisible.value))

// What the hover flyout renders: a submenu item's own flyout, or — for a panel
// menu that opted into a hover preview (flyoutOnHover, e.g. Reports) — its panel
// items. PanelSubItem is shape-compatible with SubItem for rendering + clicks.
const flyoutGroups = computed<SubItem[][]>(
  () => flyoutItem.value?.submenu ?? (flyoutItem.value?.panelSubmenu as SubItem[][] | undefined) ?? [],
)

// ─── Nav data ────────────────────────────────────────────────────────────────

// Settings level-2 panel — shared so WMS Standalone shows the same Settings list as ERP.
const settingsPanelSubmenu: PanelSubItem[][] = [
  [
    { label: 'Company profile' },
    { label: 'Users & roles' },
    { label: 'Billing' },
  ],
  [
    // Own routing identity so these are the settings pages (e.g. /sales-settings),
    // not the module list pages (/sales). The modules' own gear shortcuts point at
    // these same pages; findActive lets Settings own the highlight (see below).
    { label: 'Sales', to: 'Sales settings' },
    { label: 'Purchases', to: 'Purchase settings' },
    { label: 'Inventory', to: 'Inventory settings' },
    { label: 'Warehouses', to: 'Warehouse settings' },
    { label: 'Production', to: 'Production settings' },
    { label: 'Default accounts' },
  ],
  [
    { label: 'Templates' },
    { label: 'Custom fields' },
    { label: 'Approval workflows' },
    { label: 'Tagging rules' },
  ],
  [
    // Moved back from "Other lists" — configuration lists that belong under
    // Settings. Recurring transactions, Activity log, Export & import, File
    // manager, and Cost recalculation stay in "Other lists".
    { label: 'Tax rates' },
    { label: 'Currencies' },
    { label: 'Payment terms' },
    { label: 'Payment methods' },
    { label: 'Tags' },
  ],
  [
    // Data migration sits on its own with a divider above it.
    { label: 'Data migration' },
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
    // Storage locations is NOT here — it's a top-level nav item in WMS Standalone
    // (right after Cycle counts), not a settings page.
    { label: 'Inventory', to: 'Inventory settings' },
    { label: 'Warehouse', to: 'Warehouse settings' },
  ],
]

const erpNavGroups: NavItem[][] = [
  [
    { name: 'Home', icon: 'home' },
    {
      // Cowork opens a persistent level-2 panel (Overview / Tasks / Schedule /
      // Connections), each its own /cowork* route rendered in the stage.
      name: 'Cowork', icon: 'magic', iconLine: 'airene-outline', iconFill: 'airene-black',
      panelSubmenu: [
        [
          { label: 'Chats', to: 'Cowork chats' },
          { label: 'New task', to: 'Cowork' },
          { label: 'Tasks', to: 'Cowork tasks' },
          { label: 'Schedule', to: 'Cowork schedule' },
        ],
        [
          { label: 'Connections', to: 'Cowork connections' },
          { label: 'Agents', to: 'Cowork agents' },
          { label: 'Skills', to: 'Cowork skills' },
          { label: 'File manager', to: 'Cowork knowledge' },
        ],
      ],
    },
    {
      // Dashboard is a section: its level-2 panel holds the dashboards. Only "WMS
      // overview" has content today (Inbound/Outbound page tabs → analytics); the
      // rest are placeholders for now.
      name: 'Dashboard', icon: 'dashboard',
      panelSubmenu: [[
        { label: 'Business performance' },
        { label: 'Custom dashboard' },
        { label: 'Mekari Insight' },
        { label: 'WMS analytics' },
      ]],
    },
    {
      name: 'Reports', icon: 'reports',
      flyoutOnHover: true,
      // Each report has its own routing identity (`to`) so it never collides with
      // the same-named module or Settings page (e.g. Reports › Sales → /sales-report,
      // not /sales). Module "X reports" shortcuts point here via `shortcutTo`.
      panelSubmenu: [[
        { label: 'Financials', to: 'Financial report' },
        { label: 'Sales', to: 'Sales report' },
        { label: 'Purchases', to: 'Purchase report' },
        { label: 'Inventory', to: 'Inventory report' },
        { label: 'WMS', to: 'WMS report' },
        { label: 'Tax', to: 'Tax report' },
        { label: 'Cash & bank', to: 'Cash & bank report' },
        { label: 'Production', to: 'Production report' },
        { label: 'Fixed assets', to: 'Fixed assets report' },
      ]],
    },
    {
      name: 'Accounting', icon: 'chart-of-account',
      expandOnClick: true,
      submenu: [
        [
          { label: 'Cash management' },
          { label: 'Reconciliations' },
          { label: 'Consolidation' },
          { label: 'Chart of accounts' },
          { label: 'Close books' },
          { label: 'Fixed assets', children: [
            { label: 'Assets' },
            { label: 'Depreciation schedule' },
          ] },
          { label: 'Bank rules' },
        ],
        [{ label: 'Accounting settings', iconType: 'settings' }],
      ],
    },
  ],
  [
    {
      name: 'Sales', icon: 'sales',
      expandOnClick: true,
      submenu: [
        [
          { label: 'Sales invoices' },
          { label: 'Sales deliveries' },
          { label: 'Sales orders' },
          { label: 'Sales quotes' },
        ],
        [
          { label: 'Customers', iconType: 'shortcut' },
          { label: 'Sales reports', iconType: 'shortcut', shortcutTo: { nav: 'Reports', sub: 'Sales' } },
          { label: 'Sales settings', iconType: 'settings' },
        ],
      ],
    },
    {
      name: 'Purchases', icon: 'cart',
      expandOnClick: true,
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
          { label: 'Purchase reports', iconType: 'shortcut', shortcutTo: { nav: 'Reports', sub: 'Purchases' } },
          { label: 'Purchase settings', iconType: 'settings' },
        ],
      ],
    },
    { name: 'Expenses', icon: 'expenses' },
  ],
  [
    {
      name: 'Inventory', icon: 'products',
      // No flyout — clicking the icon opens the level-2 panel directly, same
      // as Reports/Settings. "Cost recalculation" moved to Other lists.
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
          { label: 'Products reports', iconType: 'shortcut', shortcutTo: { nav: 'Reports', sub: 'Inventory' } },
          { label: 'Inventory settings', iconType: 'settings' },
        ],
      ],
    },
    {
      name: 'WMS', icon: 'warehouse',
      expandOnClick: true,
      submenu: [
        [
          { label: 'Warehouses' },
          { label: 'Outbound delivery' },
          { label: 'Inbound delivery' },
          { label: 'Warehouse transfers' },
          { label: 'Stock adjustments' },
          { label: 'Cycle counts' },
        ],
        [
          { label: 'Storage locations' },
          { label: 'Warehouse reports', iconType: 'shortcut', shortcutTo: { nav: 'Reports', sub: 'WMS' } },
          { label: 'Warehouse settings', iconType: 'settings' },
        ],
      ],
    },
    {
      name: 'Production', icon: 'fulfillment',
      expandOnClick: true,
      submenu: [
        [{ label: 'Production plans' }, { label: 'Production request' }, { label: 'Work orders' }, { label: 'Bill of materials' }],
        [{ label: 'Production reports', iconType: 'shortcut', shortcutTo: { nav: 'Reports', sub: 'Production' } }, { label: 'Production settings', iconType: 'settings' }],
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
      name: 'Integrations', icon: 'add-ons',
      submenu: [[
        { label: 'Omnichannel commerce', iconType: 'shortcut' },
        { label: 'CRM', iconType: 'shortcut' },
        { label: 'HR & Payroll', iconType: 'shortcut' },
        { label: 'e-Signature', iconType: 'shortcut' },
        // { label: 'Tax' }, // Klikpajak paywall/first-run hidden for now
        { label: 'Mekari Pay' },
        { label: 'Mekari Expense', iconType: 'shortcut' },
      ]],
    },
    {
      name: 'Other lists', icon: 'table-view-list',
      expandOnClick: true,
      submenu: [[
        { label: 'Recurring transactions' }, { label: 'Activity log' },
        { label: 'Export & import' }, { label: 'File manager' }, { label: 'Cost recalculation' },
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
  const onTheWayCount = (c['Pending'] ?? 0) + (c['Open'] ?? 0) + (c['In progress'] ?? 0) || undefined
  items.push({ label: 'On the way', count: onTheWayCount })
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
    // No "Home" — WMS Standalone opens on Dashboard (see ErpUserMenu.selectScenario).
    { name: 'Dashboard', icon: 'dashboard' },
    {
      name: 'Reports', icon: 'reports',
      // WMS Standalone has no report index — the reports sit directly in the
      // level-2 panel: the two warehouse-stock reports first, then the four
      // inbound/outbound performance reports.
      panelSubmenu: [[
        { label: 'Warehouse stock quantity', path: '/wms-report/warehouse-stock-quantity' },
        { label: 'Warehouse item movement', path: '/wms-report/warehouse-item-movement' },
        { label: 'Inbound timeliness', path: '/wms-report/inbound-timeliness' },
        { label: 'Inbound accuracy', path: '/wms-report/inbound-accuracy' },
        { label: 'Outbound timeliness', path: '/wms-report/outbound-timeliness' },
        { label: 'Outbound accuracy', path: '/wms-report/outbound-accuracy' },
      ]],
    },
  ],
  [
    // Inventory carries a level-2 panel (Products, Categories, …) — mirrors the ERP
    // "Inventory" menu minus Price rules, which is an ERP-only commercial concern.
    {
      name: 'Inventory', icon: 'products',
      panelSubmenu: [[
        { label: 'Products', to: 'Product list' },
        { label: 'Categories' },
        { label: 'Variant options' },
        { label: 'Units' },
      ]],
    },
    { name: 'Warehouses', icon: 'warehouse' },
  ],
  [
    { name: 'Outbound delivery', icon: 'sales' },
    { name: 'Inbound delivery', icon: 'cart' },
  ],
  [
    // Mirrors the ERP "Warehouse transfers" module — same page (/warehouse-transfers).
    { name: 'Warehouse transfers', icon: 'transfer' },
    // Siblings, mirroring the ERP "WMS" group — "Stock adjustments" is the full
    // ledger (same page/content as ERP's), "Cycle counts" is the WMS count-task flow.
    { name: 'Stock adjustments', icon: 'table-view-list' },
    { name: 'Cycle counts', icon: 'chart-of-account' },
    // Promoted out of Settings — storage locations are day-to-day warehouse
    // structure in WMS Standalone, not configuration.
    { name: 'Storage locations', icon: 'location' },
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

// XPM (Mekari Expense) nav — mirrors the standalone Expense product's own sidebar
// (Home / Reports · Accounts / Transactions / Budgeting · Purchasing / Trips /
// Claims / Cards · My claims / My trips · Settings). Routes are global-by-URL like
// every other scenario; only the tree swaps. Purchasing + Settings carry a level-2
// panel (same UI as ERP's Reports/Settings). Icons reuse the CDN set 1:1 with the
// source app.
const xpmNavGroups: NavItem[][] = [
  [
    { name: 'Home', icon: 'home' },
    { name: 'Reports', icon: 'reports', to: 'Xpm reports' },
  ],
  [
    { name: 'Accounts', icon: 'wallet' },
    { name: 'Transactions', icon: 'log', to: 'Xpm transactions' },
    { name: 'Budgeting', icon: 'finance' },
  ],
  [
    {
      name: 'Purchasing', icon: 'expenses',
      panelSubmenu: [[
        { label: 'Purchases', to: 'Xpm purchases' },
        { label: 'Products', to: 'Xpm products' },
        { label: 'Warehouses', to: 'Xpm warehouses' },
      ]],
    },
    { name: 'Trips', icon: 'voucher', to: 'Xpm trips' },
    { name: 'Claims', icon: 'protection', to: 'Xpm claims' },
    { name: 'Cards', icon: 'billing', to: 'Xpm cards' },
  ],
  [
    { name: 'My claims', icon: 'reimbursement' },
    { name: 'My trips', icon: 'business-trip' },
  ],
  [
    {
      name: 'Settings', icon: 'settings',
      panelSubmenu: [[
        { label: 'Users', to: 'Xpm users' },
        { label: 'Vendors', to: 'Xpm vendors' },
        { label: 'Policy', to: 'Xpm policy' },
        { label: 'Integration', to: 'Xpm integration' },
      ]],
    },
  ],
]

// Mekari Buzz (Marketing tool) nav — Campaigns + Assets. Assets carries a level-2
// panel (same UI as ERP's Reports/Settings) with Branding + Photo stocks.
const buzzNavGroups: NavItem[][] = [
  [
    { name: 'Home', icon: 'home' },
    { name: 'Campaigns', icon: 'promo', to: 'Buzz campaigns' },
  ],
  [
    {
      name: 'Assets', icon: 'products',
      panelSubmenu: [[
        { label: 'Branding', to: 'Buzz branding' },
        { label: 'Photo stocks', to: 'Buzz photo stocks' },
      ]],
    },
  ],
]

// Active scenario drives which nav is shown. WMS Ops + Ops 2 share the trimmed
// Ops menu; WMS Standalone uses the full WMS nav; XPM uses the Expense nav; Buzz
// uses the Marketing nav; ERP uses the ERP nav.
const { activeScenario } = useScenario()
const navGroups = computed<NavItem[][]>(() => {
  if (activeScenario.value === 'WMS Ops' || activeScenario.value === 'WMS Ops 2') return wmsOpsNavGroups.value
  if (activeScenario.value.startsWith('WMS')) return wmsStandaloneNavGroups.value
  if (activeScenario.value === 'XPM') return xpmNavGroups
  if (activeScenario.value === 'BUZZ') return buzzNavGroups
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
// The panel content an expandOnClick item promotes to — either its own
// explicit array, or a verbatim mirror of its flyout submenu.
function expandGroupsFor(item: NavItem): PanelSubItem[][] {
  if (Array.isArray(item.expandOnClick)) return item.expandOnClick
  return (item.submenu ?? []).map((group) => group.map((s) => ({ label: s.label, iconType: s.iconType, to: s.to, children: s.children })))
}

// A panel/flyout item flagged 'shortcut' or 'settings' is a POINTER into another
// section's page, not that page's owner — e.g. a module's gear "Sales settings"
// points at the Settings › Sales page; WMS's "Warehouse settings" too. On the
// first resolution pass we skip pointers so the real owning section (Settings,
// Reports) wins the highlight; the second pass (allowShortcuts=true) still lets a
// standalone pointer resolve when nothing else claims the URL.
function isPointer(iconType?: 'shortcut' | 'settings'): boolean {
  return iconType === 'shortcut' || iconType === 'settings'
}

function findActive(pageKey: string, allowShortcuts: boolean): {
  nav: string
  sub: string | null
  panel: ActivePanel | null
} | null {
  for (const group of navGroups.value) {
    for (const item of group) {
      // slug-based match so names with caps/slashes (e.g. 'Stock in/out') still
      // resolve through the URL round-trip
      if (labelToPath(item.to ?? item.name) === labelToPath(pageKey)) {
        // If the matched nav item owns a level-2 panel, return it so the panel
        // stays open on refresh of a detail page (e.g. /stock-adjustments/wsa-001
        // resolves to 'Stock adjustments', which has a panelSubmenu).
        const panel = item.panelSubmenu
          ? { title: item.name, groups: item.panelSubmenu, parentNavName: item.name }
          : null
        // When a panel sub-item owns this exact route (e.g. Cowork › Overview lives
        // at /cowork, the same route as the Cowork nav item), highlight that child
        // instead of leaving the panel with no active item (which would fall back to
        // the last-used sub from localStorage).
        let sub: string | null = null
        for (const g of item.panelSubmenu ?? []) {
          for (const p of g) {
            if (labelToPath(p.to ?? p.label) === labelToPath(pageKey)) { sub = p.label; break }
          }
          if (sub) break
        }
        return { nav: item.name, sub, panel }
      }
      // expandOnClick items: check their promoted-panel content BEFORE the plain
      // submenu loop below, so a page that's part of the promoted panel restores
      // it (and the right highlight) on a hard refresh — not just a bare "sub" match.
      if (item.expandOnClick) {
        const groups = expandGroupsFor(item)
        for (const g of groups) {
          for (const p of g) {
            if (!allowShortcuts && isPointer(p.iconType)) continue
            if (labelToPath(p.to ?? p.label) === labelToPath(pageKey)) {
              return { nav: item.name, sub: p.label, panel: { title: item.name, groups, parentNavName: item.name } }
            }
            // Accordion children (e.g. Fixed assets › Assets): the active sub is the
            // child, so a refresh on its page restores the panel with the accordion
            // expanded (isAccordionOpen keys off the active child).
            for (const child of p.children ?? []) {
              if (labelToPath(child.to ?? child.label) === labelToPath(pageKey)) {
                return { nav: item.name, sub: child.label, panel: { title: item.name, groups, parentNavName: item.name } }
              }
            }
          }
        }
      }
      for (const subGroup of item.submenu ?? []) {
        for (const sub of subGroup) {
          // Shortcut flyout items (e.g. WMS → "Warehouse settings") are pointers
          // into another module's page, not owners — skip on the first pass so the
          // real owning section (Settings) wins the active highlight.
          if (!allowShortcuts && isPointer(sub.iconType)) continue
          // Only a leaf flyout item resolves to itself here. An item that owns a
          // level-3 panel (e.g. Contacts › Customers) must fall through to the
          // panelSubmenu loop so the panel is restored/opened, not left collapsed.
          // Slug-based compare (like every other match) so labels whose casing/
          // punctuation don't survive the URL round-trip still resolve — e.g.
          // 'Mekari Pay' → /mekari-pay → 'Mekari pay', 'CRM' → 'Crm'.
          if (!sub.panelSubmenu && labelToPath(sub.to ?? sub.label) === labelToPath(pageKey)) {
            return { nav: item.name, sub: sub.label, panel: null }
          }
          for (const pGroup of sub.panelSubmenu ?? []) {
            for (const p of pGroup) {
              if (!allowShortcuts && isPointer(p.iconType)) continue
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
          if (!allowShortcuts && isPointer(p.iconType)) continue
          // Match an explicit `path` (e.g. WMS Standalone report items →
          // /wms-report/<slug>) against the live route so the level-2 panel stays
          // open on those pages; otherwise fall back to the label/slug round-trip.
          if ((p.path && p.path === route.path) || labelToPath(p.to ?? p.label) === labelToPath(pageKey)) {
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

watch([currentPageKey, activeSectionOverride, () => route.path, () => route.query.tab, () => route.query.innerTab], ([urlKey, override]) => {
  const key = override ?? urlKey
  // Inbox is reached from the header notification icon, not the sidebar tree —
  // open its own level-2 panel (titled INBOX) and don't highlight any nav item.
  if (key === 'Inbox') {
    const tab = (route.query.tab as string | undefined) ?? 'notifications'
    const groups = inboxPanelSubmenu.value
    let matchLabel = groups[0][0]!.label // 'Notifications'
    if (tab === 'awaiting-approval') {
      const awaitingApproval = groups[0][1]!
      const innerTab = (route.query.innerTab as string | undefined) ?? 'sales'
      const child = awaitingApproval.children!.find(c => c.path?.includes(`innerTab=${innerTab}`))
        ?? awaitingApproval.children![0]!
      matchLabel = child.label
    }
    openPanel({ title: 'Inbox', groups, parentNavName: 'Inbox' })
    activePanelSubItem.value = matchLabel
    activeItem.value = ''
    setActiveMenuLabel(matchLabel)
    return
  }
  // OCR file review is a full-bleed page with its own title bar (reachable from
  // both Expenses and Purchase invoices) — keep the nav rail highlighted but
  // don't leave the Purchases level-2 submenu open over it.
  const isFileReviewRoute = /^\/(expenses|purchase-invoices)\/review\//.test(route.path)
  let { nav, sub, panel } = resolveActive(key)
  if (isFileReviewRoute) {
    sub = null
    panel = null
  }
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
  const sameSection = !isFileReviewRoute && (activePanel.value?.parentNavName === nav || panel?.parentNavName === nav)
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
  if (item.panelSubmenu) {
    flyoutItem.value = null
    // Nav item that directly opens a panel (e.g. Reports)
    if (activePanel.value?.parentNavName === item.name) {
      // Already in this section — keep the level-2 panel open (no toggle-close).
      isPanelVisible.value = true
    } else {
      const firstItem = item.panelSubmenu[0][0]
      openPanel({ title: item.name, groups: item.panelSubmenu, parentNavName: item.name })
      activePanelSubItem.value = firstItem.label
      // Honor a direct `path` (e.g. WMS Standalone Reports → /wms-report/:slug) —
      // same as handlePanelSubItemClick; navigate(label) alone would derive a wrong
      // route and land on a blank placeholder.
      if (firstItem.path) router.push(firstItem.path)
      else navigate(firstItem.to ?? firstItem.label)
      activeItem.value = item.name
    }
  } else if (item.expandOnClick && activePanel.value?.parentNavName === item.name) {
    // Already in this section — keep the level-2 panel open (no toggle-close).
    flyoutItem.value = null
    isPanelVisible.value = true
  } else if (!item.submenu) {
    // Simple leaf nav item (e.g. Home, Expenses, Settings)
    flyoutItem.value = null
    activeItem.value = item.name
    if (item.path) router.push(item.path)
    else navigate(item.to ?? item.name)
    closePanel()
  } else {
    // Items with a flyout — clicking the icon itself is a shortcut straight to
    // the flyout's first item. The flyout stays open (the cursor is still
    // hovering it) — unlike clicking an actual flyout item, which closes it.
    const first = item.submenu.flat()[0]
    if (first) {
      activeItem.value = item.name
      navigate(first.to ?? first.label)
    }
  }
}

// Jump to another nav section's panel item — used by module "reports" shortcuts,
// which open the central Reports panel (e.g. Reports › Sales) rather than a report
// page inside the module. Opens the target nav's panel, highlights the sub-item,
// and navigates there so the sidebar shows Reports (not the originating module).
function openShortcutTo(navName: string, subLabel: string) {
  flyoutItem.value = null
  const nav = navGroups.value.flat().find((n) => n.name === navName)
  if (!nav?.panelSubmenu) return
  openPanel({ title: nav.name, groups: nav.panelSubmenu, parentNavName: nav.name })
  activePanelSubItem.value = subLabel
  const target = nav.panelSubmenu.flat().find((s) => s.label === subLabel)
  navigate(target?.to ?? subLabel)
  activeItem.value = nav.name
}

function handlePanelSubItemClick(sub: PanelSubItem) {
  if (sub.shortcutTo) { openShortcutTo(sub.shortcutTo.nav, sub.shortcutTo.sub); return }
  activePanelSubItem.value = sub.label
  if (sub.path) router.push(sub.path)
  else navigate(sub.to ?? sub.label)
}

// An accordion (e.g. Fixed assets) shows open when the user manually expanded it
// OR when one of its children is the active page (so it's expanded while you're
// inside that section, and restores open on refresh). Closed by default.
function isAccordionOpen(sub: PanelSubItem): boolean {
  if (expandedAccordion.value === sub.label) return true
  return sub.children?.some((c) => c.label === activePanelSubItem.value) ?? false
}
// Clicking the accordion header only expands/collapses it — it does NOT navigate.
// The user then picks a child (e.g. Assets, Depreciation schedule) to go there.
function handlePanelAccordionClick(sub: PanelSubItem) {
  expandedAccordion.value = expandedAccordion.value === sub.label ? null : sub.label
}

function handleFlyoutSubItemClick(sub: SubItem) {
  if (sub.shortcutTo) { openShortcutTo(sub.shortcutTo.nav, sub.shortcutTo.sub); return }
  const parentItem = flyoutItem.value!
  const parentName = parentItem.name
  flyoutItem.value = null

  if (sub.panelSubmenu) {
    // Level-2 item that opens a level-3 panel — auto-select first panel item
    const panelTitle = sub.panelTitle ?? parentName
    const firstItem = sub.panelSubmenu[0][0]
    openPanel({ title: panelTitle, groups: sub.panelSubmenu, parentNavName: parentName })
    activePanelSubItem.value = firstItem.label
    navigate(firstItem.to ?? firstItem.label)
    activeItem.value = parentName
  } else if (parentItem.expandOnClick) {
    // Promote the whole flyout into a persistent panel, highlighting the
    // clicked item (see NavItem.expandOnClick).
    const groups = expandGroupsFor(parentItem)
    openPanel({ title: parentName, groups, parentNavName: parentName })
    activeItem.value = parentName
    if (sub.children) {
      // The hover flyout is a quick-jump: clicking an accordion item (e.g. Fixed
      // assets) navigates straight to its default child (Assets) — the accordion
      // then shows open in the panel because that child is active. (This differs
      // from the panel header, which only toggles.)
      const first = sub.children[0]
      if (first) {
        activePanelSubItem.value = first.label
        navigate(first.to ?? first.label)
      }
    } else {
      activePanelSubItem.value = sub.label
      navigate(sub.to ?? sub.label)
    }
  } else if (parentItem.panelSubmenu) {
    // Panel menu with a hover flyout (flyoutOnHover, e.g. Reports): clicking a
    // flyout item opens the full level-2 panel with that item selected — same as
    // clicking the panel item directly.
    openPanel({ title: parentName, groups: parentItem.panelSubmenu, parentNavName: parentName })
    activePanelSubItem.value = sub.label
    navigate(sub.to ?? sub.label)
    activeItem.value = parentName
  } else {
    // Regular level-2 item — navigate directly, close any open panel
    activeItem.value = parentName
    navigate(sub.to ?? sub.label)
    closePanel()
  }
}

function handleItemMouseEnter(e: MouseEvent, item: NavItem) {
  // A panel menu previews on hover only if it opted in (flyoutOnHover, e.g. Reports).
  const hasFlyout = !!item.submenu || (!!item.panelSubmenu && !!item.flyoutOnHover)
  // Suppress the flyout while this item's OWN promoted/opted-in panel is open, so
  // hovering it doesn't re-pop the preview over the panel it already expanded to.
  const ownPanelActive =
    (item.expandOnClick || item.flyoutOnHover) && activePanel.value?.parentNavName === item.name
  if (!hasFlyout || ownPanelActive) {
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
  // Generous delay so crossing the gap from the rail to the flyout doesn't close it.
  closeTimer = setTimeout(() => { flyoutItem.value = null }, 300)
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

/* is-flyout-open keeps this look while the cursor has moved off the button and
   onto the Teleported flyout popover — real CSS :hover alone can't do this,
   since the flyout isn't a descendant of the button in the DOM. */
.nav-item:hover, .nav-item.is-flyout-open { background-color: var(--mp-background-neutral-subtle-hovered); }
.nav-item:hover img, .nav-item.is-flyout-open img { filter: brightness(0) saturate(100%) invert(26%) sepia(60%) saturate(600%) hue-rotate(185deg) brightness(85%) contrast(95%); }
.nav-item:hover .nav-label, .nav-item.is-flyout-open .nav-label { color: var(--mp-text-link, #165082); }

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

/* Accordion header (e.g. Fixed assets) — chevron rotates when expanded */
.panel-accordion-chevron {
  flex-shrink: 0;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  transition: transform 150ms;
}
.panel-item--accordion.is-open .panel-accordion-chevron { transform: rotate(180deg); }

/* Accordion children (e.g. Assets, Depreciation schedule) — 12px left/right padding. */
.panel-item--child { padding-left: var(--mp-spacing-3); padding-right: var(--mp-spacing-3); }

.panel-item-icon {
  width: var(--mp-sizes-4);
  height: var(--mp-sizes-4);
  flex-shrink: 0;
  filter: brightness(0) opacity(0.5);
}

/* Settings gear renders at the default 20px in the level-2 panel. */
.panel-item-icon--settings { width: var(--mp-sizes-5); height: var(--mp-sizes-5); }

/* Task-count indicator — right-aligned; appearance (color/shape/size) comes
   from MpBadge itself (for="additionalInformation" type="warning" size="sm"). */
.panel-item-count {
  flex-shrink: 0;
}

/* Parent row (e.g. Awaiting approval) — not a nav target itself, just toggles
   its children list; keeps the normal panel-item hover feedback. */
.panel-item-chevron {
  flex-shrink: 0;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  transition: transform 150ms ease;
}
.panel-item-chevron--collapsed {
  transform: rotate(-90deg);
}

/* Children read as secondary text; the active state matches .panel-item.active
   exactly (same blue + bg) so a selected child reads like a selected top-level item. */
.panel-item--child {
  color: var(--mp-text-secondary);
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
/* Invisible bridge over the 8px gap between the rail and the flyout, so moving
   the cursor across it keeps the pointer "inside" the flyout and it doesn't
   close before you reach it (hover-intent fix). */
.submenu-flyout::before {
  content: '';
  position: absolute;
  top: 0;
  left: calc(-1 * var(--mp-spacing-3));
  width: var(--mp-spacing-3);
  height: 100%;
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

.submenu-item.active {
  background-color: #E2E8F0;
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-link, #165082);
}

.submenu-item-icon { width: var(--mp-sizes-5); height: var(--mp-sizes-5); flex-shrink: 0; filter: brightness(0) opacity(0.5); }
.submenu-item-icon--shortcut { width: var(--mp-sizes-4); height: var(--mp-sizes-4); }
</style>
