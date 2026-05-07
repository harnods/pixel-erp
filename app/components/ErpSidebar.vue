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
              <img
                v-if="sub.iconType === 'shortcut'"
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface PanelSubItem {
  label: string
  iconType?: 'shortcut' | 'settings'
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

const isExpanded = ref(false)
const isPanelVisible = ref(true)
const activeItem = ref('Home')
const activePanel = ref<ActivePanel | null>(null)
const activePanelSubItem = ref<string | null>(null)

const toggleIcon = toggleIconUrl
const shortcutIcon = shortcutIconUrl
const settingsIcon = 'https://cdn.mekari.design/icons/settings-outline.svg'

const { navigate } = useNavigation()

const flyoutItem = ref<NavItem | null>(null)
const flyoutStyle = ref<Record<string, string>>({})
let closeTimer: ReturnType<typeof setTimeout> | null = null

// ─── Computed ─────────────────────────────────────────────────────────────────

// Main nav collapses while a panel is open
const navExpanded = computed(() => isExpanded.value && !activePanel.value)
// Arrow points left when nav is expanded OR when a panel is visible
const arrowPointsLeft = computed(() => navExpanded.value || (!!activePanel.value && isPanelVisible.value))

// ─── Nav data ────────────────────────────────────────────────────────────────

const navGroups: NavItem[][] = [
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
                { label: 'Products' },
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
      name: 'Warehouses', icon: 'warehouse',
      submenu: [
        [
          {
            label: 'Warehouse',
            panelSubmenu: [[
              { label: 'All warehouses' },
              { label: 'Stock adjustments' },
              { label: 'Warehouse transfers' },
              { label: 'Stock requests' },
              { label: 'Storage locations' },
            ]],
          },
          {
            label: 'Fulfillments',
            panelTitle: 'Fulfillments',
            panelSubmenu: [[
              { label: 'Sales orders' },
              { label: 'Purchase orders' },
            ]],
          },
        ],
        [{ label: 'Warehouse settings', iconType: 'settings' }],
      ],
    },
    {
      name: 'Production', icon: 'fulfillment',
      submenu: [
        [{ label: 'Production plans' }, { label: 'Work orders' }, { label: 'Bill of materials' }],
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
      panelSubmenu: [
        [
          { label: 'Company profile' },
          { label: 'Users & roles' },
          { label: 'Billing' },
        ],
        [
          { label: 'Sales' },
          { label: 'Purchases' },
          { label: 'Inventory' },
          { label: 'Warehouses' },
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
      ],
    },
  ],
]

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
      navigate(firstItem.label)
      activeItem.value = item.name
    }
  } else if (!item.submenu) {
    // Simple leaf nav item (e.g. Home, Expenses, Settings)
    activeItem.value = item.name
    navigate(item.name)
    closePanel()
  }
  // Items with submenu: flyout opens on hover, click does nothing
}

function handlePanelSubItemClick(sub: PanelSubItem) {
  activePanelSubItem.value = sub.label
  navigate(sub.label)
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
    navigate(firstItem.label)
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
  justify-content: center;
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
  justify-content: flex-start;
}

.nav-item:hover { background-color: var(--mp-background-neutral-subtle-hovered); }
.nav-item:hover img { filter: brightness(0) saturate(100%) invert(26%) sepia(60%) saturate(600%) hue-rotate(185deg) brightness(85%) contrast(95%); }
.nav-item:hover .nav-label { color: var(--mp-text-selected); }

.nav-item.active { background-color: var(--mp-background-neutral-pressed); }
.nav-item.active .nav-icon-line { display: none; }
.nav-item .nav-icon-fill { display: none; }
.nav-item.active .nav-icon-fill {
  display: block;
  filter: brightness(0) saturate(100%) invert(35%) sepia(55%) saturate(700%) hue-rotate(120deg) brightness(90%) contrast(100%);
}
.nav-item.active .nav-label { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-selected); }

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
  line-height: 20px;        /* custom — px line-height, not a ratio token */
  opacity: 0;
  max-width: 0;
  overflow: hidden;
  white-space: nowrap;
  pointer-events: none;
  transition: opacity 120ms ease, max-width 220ms cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar.is-expanded .nav-label { opacity: 1; max-width: 160px; }

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
  line-height: 20px;          /* custom — px line-height, not a ratio token */
  transition: background-color 100ms;
}

.panel-item:hover { background-color: var(--mp-background-neutral-subtle-hovered); }

.panel-item.active {
  background-color: var(--mp-background-nav-stack-hovered);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-selected);
}

.panel-item-icon {
  width: var(--mp-sizes-4);
  height: var(--mp-sizes-4);
  flex-shrink: 0;
  filter: brightness(0) opacity(0.5);
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
  border-bottom: 1px solid var(--mp-border-default, #dcdfe4);
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
  line-height: 20px;          /* custom — px line-height, not a ratio token */
  transition: background-color 100ms;
}

.submenu-item:hover { background-color: var(--mp-background-neutral-subtle-hovered); }

.submenu-item-icon { width: var(--mp-sizes-5); height: var(--mp-sizes-5); flex-shrink: 0; filter: brightness(0) opacity(0.5); }
.submenu-item-icon--shortcut { width: var(--mp-sizes-4); height: var(--mp-sizes-4); }
</style>
