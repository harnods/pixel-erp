<script setup lang="ts">
/**
 * HR (Talenta) product sidebar — shown while the HR product is active (/hr* and
 * the HR module pages). Same level-1 rail + level-2 secondary panel + hover
 * flyout behaviour and hover/active colours as ErpSidebar: a section with a
 * submenu (Employees) opens a persistent level-2 panel on click (rail collapses
 * beside it) and previews a Teleported flyout on hover.
 */
import { ref, reactive, computed, watch } from 'vue'
import { infoToast } from '~/utils/toasts'
import { toast, MpTooltip } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import toggleIcon from '~/assets/images/sidebar-toggle.svg?url'
import { getEmployee } from '~/data'

const router = useRouter()
const route = useRoute()

const expanded = ref(true)

interface SubItem { label: string; to: string }
interface Item { icon: string; name: string; to?: string; submenu?: SubItem[][] }
const groups: Item[][] = [
  [
    { icon: 'home',         name: 'Home', to: '/hr' },
    // Opens the signed-in user's own profile (no auth in the prototype → Rizal Candra).
    { icon: 'profile',      name: 'Employee profile', to: '/employee-directory/EMP-0001' },
    { icon: 'team',         name: 'Employees', submenu: [[
      { label: 'Employee directory', to: '/employee-directory' },
      { label: 'Organization chart', to: '/organization-chart' },
      { label: 'Employee transfer',  to: '/employee-transfer' },
      { label: 'Resignation',        to: '/resignation' },
    ]] },
    { icon: 'briefcase',    name: 'Recruitment' },
    { icon: 'time',         name: 'Time' },
    { icon: 'finance',      name: 'Finance' },
    { icon: 'calculator',   name: 'Payroll' },
    { icon: 'productivity', name: 'Productivity' },
    { icon: 'company',      name: 'Company' },
  ],
  [
    { icon: 'application', name: 'Applications' },
    { icon: 'add-ons',     name: 'Integrations' },
  ],
  [
    { icon: 'settings', name: 'Settings' },
  ],
]

function subMatches(s: SubItem) {
  return route.path === s.to || route.path.startsWith(s.to + '/')
}
// The section whose submenu owns the current route → its level-2 panel is open.
const activePanel = computed<Item | null>(() => {
  for (const g of groups) for (const it of g)
    if (it.submenu && it.submenu.some((grp) => grp.some(subMatches))) return it
  return null
})
const activeItem = computed<string>(() => {
  if (route.path === '/hr') return 'Home'
  // On an employee detail the level-2 panel becomes the employee-profile menu,
  // so the active level-1 icon is "Employee profile" — not "Employees".
  if (isEmployeeDetail.value) return 'Employee profile'
  return activePanel.value?.name ?? ''
})
// Main rail collapses to icons while a level-2 panel is open (ErpSidebar).
// Below tablet width the expanded nav (216px) starves the content area, so we
// force the collapsed icon rail there regardless of the saved preference
// (mirrors ErpSidebar).
const isNarrowViewport = ref(false)
if (import.meta.client) {
  const mq = window.matchMedia('(max-width: 1024px)')
  isNarrowViewport.value = mq.matches
  mq.addEventListener('change', (e) => { isNarrowViewport.value = e.matches })
}
const railExpanded = computed(() => expanded.value && !activePanel.value && !isNarrowViewport.value)

// ── Hover flyout (identical mechanic to ErpSidebar) ──────────────────────────
const flyoutItem = ref<Item | null>(null)
const flyoutStyle = ref<Record<string, string>>({})
const flyoutGroups = computed<SubItem[][]>(() => flyoutItem.value?.submenu ?? [])
let closeTimer: ReturnType<typeof setTimeout> | null = null

function handleItemMouseEnter(e: MouseEvent, item: Item) {
  // No flyout for a plain item, nor for the section whose panel is already open.
  if (!item.submenu || activePanel.value?.name === item.name) { scheduleClose(); return }
  cancelClose()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  flyoutItem.value = item
  flyoutStyle.value = { top: `${rect.top}px`, left: `${rect.right + 8}px` }
}
function scheduleClose() {
  closeTimer = setTimeout(() => { flyoutItem.value = null }, 300)
}
function cancelClose() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
}

function handleNavClick(item: Item) {
  if (item.submenu) { router.push(item.submenu[0]![0]!.to); flyoutItem.value = null; return }
  if (item.to) { router.push(item.to); return }
  infoToast(`${item.name} — coming soon`)
}
function handleFlyoutSubItemClick(sub: SubItem) {
  router.push(sub.to)
  flyoutItem.value = null
}
function handlePanelSubItemClick(sub: SubItem) {
  router.push(sub.to)
}

// Collapsed-rail hover tooltip. Only relevant while the rail is collapsed to
// icons (railExpanded false) — once expanded the label is already visible. An
// item with a `submenu` reveals a flyout on hover (see handleItemMouseEnter),
// so it gets no tooltip — the flyout already names the section and a tooltip
// would collide with it. Plain items (no submenu) still get the tooltip.
function navItemTooltip(item: Item): string | undefined {
  if (railExpanded.value) return undefined
  if (item.submenu) return undefined
  return item.name
}

// ── Employee-profile level-2 menu (shown when viewing an employee detail) ──────
interface ProfileItem { label: string; view?: string; children?: { label: string; view: string }[] }
const PROFILE_MENU: ProfileItem[] = [
  { label: 'Employee profile', children: [
    { label: 'Personal data',   view: 'personal-data' },
    { label: 'Employment info', view: 'employment-info' },
    { label: 'Additional info', view: 'additional-info' },
  ] },
  { label: 'Time management', children: [
    { label: 'Time off',   view: 'time-off' },
    { label: 'Attendance', view: 'attendance' },
    { label: 'Overtime',   view: 'overtime' },
  ] },
  { label: 'Finance', children: [
    { label: 'Benefit reimbursement', view: 'benefit-reimbursement' },
    { label: 'Cash advance',          view: 'cash-advance' },
    { label: 'Employee loan',         view: 'employee-loan' },
  ] },
  { label: 'Payroll', children: [
    { label: 'Payroll info', view: 'payroll-info' },
    { label: 'Payslip',      view: 'payslip' },
  ] },
  { label: 'Files',  view: 'files' },
  { label: 'Assets', view: 'assets' },
  { label: 'Employment history', children: [
    { label: 'Salary adjustment', view: 'salary-adjustment' },
    { label: 'Employee transfer', view: 'employee-transfer' },
    { label: 'NPP',               view: 'npp' },
    { label: 'Reprimand',         view: 'reprimand' },
  ] },
]

// Employee detail route (/employee-directory/:id, excluding /new and /:id/edit).
const employeeDetailId = computed<string | null>(() => {
  const segs = route.path.split('/').filter(Boolean)
  if (segs[0] !== 'employee-directory' || !segs[1] || segs[1] === 'new' || segs[2] === 'edit') return null
  return segs[1]
})
const isEmployeeDetail = computed(() => !!employeeDetailId.value)
const profileEmployee = computed(() => (employeeDetailId.value ? getEmployee(employeeDetailId.value) : null))
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
}
function hueFor(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}
function statusBadgeAttrs(s?: string): { type?: 'announcement' | 'warning'; label: string } {
  if (s === 'resigned') return { type: 'announcement', label: 'Resigned' }
  if (s === 'resigning') return { type: 'warning', label: 'Resigning' }
  return { label: 'Active' }
}
const currentView = computed(() => (route.query.view as string) || 'personal-data')
const isViewActive = (view?: string) => !!view && currentView.value === view

const openAccordions = reactive<Record<string, boolean>>({})
watch([isEmployeeDetail, currentView], () => {
  if (!isEmployeeDetail.value) return
  const hasActive = PROFILE_MENU.some((it) => it.children?.some((c) => isViewActive(c.view)))
  for (const it of PROFILE_MENU) {
    if (it.children?.some((c) => isViewActive(c.view))) openAccordions[it.label] = true
  }
  if (!hasActive && openAccordions['Employee profile'] === undefined) openAccordions['Employee profile'] = true
}, { immediate: true })
function toggleAccordion(label: string) { openAccordions[label] = !openAccordions[label] }
// True when one of an accordion's children is the active view → highlight the header.
function accordionActive(item: ProfileItem) { return !!item.children?.some((c) => isViewActive(c.view)) }
function goView(view?: string) {
  if (!view || !employeeDetailId.value) return
  router.push({ path: `/employee-directory/${employeeDetailId.value}`, query: { view } })
}
</script>

<template>
  <div class="sidebar-wrapper">
    <nav class="sidebar hr-sidebar" :class="{ 'is-expanded': railExpanded }" aria-label="HR navigation">
      <div class="sidebar-header" data-devchange="sidebar-collapsed-tooltip">
        <button class="sidebar-toggle" title="Toggle sidebar" @click="expanded = !expanded">
          <img :src="toggleIcon" alt="Toggle sidebar">
        </button>
      </div>

      <div v-for="(group, gi) in groups" :key="gi" class="nav-group">
        <template v-for="item in group" :key="item.name">
          <!-- Collapsed rail: styled Pixel tooltip on hover. Rendered only when a
               tooltip is wanted (see navItemTooltip) so an excluded/active item
               carries no tooltip node at all — avoids a stale empty tooltip box. -->
          <MpTooltip
            v-if="navItemTooltip(item)"
            :id="`hr-nav-tt-${item.name}`"
            :label="navItemTooltip(item)!"
            placement="right"
            use-portal
          >
            <button
              class="nav-item"
              :class="{ active: activeItem === item.name, 'is-flyout-open': flyoutItem?.name === item.name }"
              @click="handleNavClick(item)"
              @mouseenter="(e) => handleItemMouseEnter(e, item)"
              @mouseleave="scheduleClose"
            >
              <img :src="`https://cdn.mekari.design/icons/${item.icon}-outline.svg`" class="nav-icon-line" alt="" />
              <img :src="`https://cdn.mekari.design/icons/${item.icon}-fill.svg`" class="nav-icon-fill" alt="" />
              <span class="nav-label">{{ item.name }}</span>
            </button>
          </MpTooltip>
          <button
            v-else
            class="nav-item"
            :class="{ active: activeItem === item.name, 'is-flyout-open': flyoutItem?.name === item.name }"
            @click="handleNavClick(item)"
            @mouseenter="(e) => handleItemMouseEnter(e, item)"
            @mouseleave="scheduleClose"
          >
            <img :src="`https://cdn.mekari.design/icons/${item.icon}-outline.svg`" class="nav-icon-line" alt="" />
            <img :src="`https://cdn.mekari.design/icons/${item.icon}-fill.svg`" class="nav-icon-fill" alt="" />
            <span class="nav-label">{{ item.name }}</span>
          </button>
        </template>
      </div>
    </nav>

    <!-- Level-2 secondary panel -->
    <Transition name="panel">
      <div v-if="activePanel || isEmployeeDetail" class="sidebar-panel">
        <!-- Employee-profile menu (accordions) — while viewing an employee detail -->
        <template v-if="isEmployeeDetail">
          <div class="panel-header panel-header--profile">
            <img v-if="profileEmployee?.photo" :src="profileEmployee.photo" :alt="profileEmployee.fullName" class="profile-avatar" />
            <div
              v-else
              class="profile-avatar profile-avatar--placeholder"
              :style="{ background: `hsl(${hueFor(profileEmployee?.fullName ?? '?')} 62% 90%)`, color: `hsl(${hueFor(profileEmployee?.fullName ?? '?')} 55% 32%)` }"
            >{{ initials(profileEmployee?.fullName ?? '?') }}</div>
            <h2 class="profile-name">{{ profileEmployee?.fullName }}</h2>
            <p class="profile-position">{{ profileEmployee?.jobPosition ?? '—' }}</p>
            <span v-if="profileEmployee" class="profile-badge">
              <ErpStatusBadge badge-for="additionalInformation" :status="profileEmployee.status" v-bind="statusBadgeAttrs(profileEmployee.status)" />
            </span>
          </div>
          <div class="panel-list">
            <template v-for="item in PROFILE_MENU" :key="item.label">
              <template v-if="item.children">
                <button class="panel-item panel-item--accordion" :class="{ 'is-open': openAccordions[item.label], 'is-active-parent': accordionActive(item) }" @click="toggleAccordion(item.label)">
                  <span>{{ item.label }}</span>
                  <svg class="panel-accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
                <button
                  v-for="child in item.children"
                  v-show="openAccordions[item.label]"
                  :key="child.label"
                  class="panel-item panel-item--child"
                  :class="{ active: isViewActive(child.view) }"
                  @click="goView(child.view)"
                >
                  <span>{{ child.label }}</span>
                </button>
              </template>
              <button v-else class="panel-item" :class="{ active: isViewActive(item.view) }" @click="goView(item.view)">
                <span>{{ item.label }}</span>
              </button>
            </template>
          </div>
        </template>

        <!-- Normal section panel -->
        <template v-else-if="activePanel">
          <div class="panel-header">
            <span class="panel-title">{{ activePanel.name.toUpperCase() }}</span>
          </div>
          <div class="panel-list">
            <template v-for="(group, gi) in activePanel.submenu" :key="gi">
              <div v-if="gi > 0" class="panel-divider" />
              <button
                v-for="sub in group"
                :key="sub.label"
                class="panel-item"
                :class="{ active: subMatches(sub) }"
                @click="handlePanelSubItemClick(sub)"
              >
                <span>{{ sub.label }}</span>
              </button>
            </template>
          </div>
        </template>
      </div>
    </Transition>
  </div>

  <!-- Level-2 hover flyout preview (Teleported, like ErpSidebar) -->
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
            :class="{ active: subMatches(sub) }"
            @click="handleFlyoutSubItemClick(sub)"
          >
            <span>{{ sub.label }}</span>
          </button>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.sidebar-wrapper { display: flex; height: 100%; flex-shrink: 0; }

.sidebar {
  width: 52px;
  background: var(--mp-background-neutral-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1);
  will-change: width;
  padding: 0 var(--mp-spacing-2) var(--mp-spacing-2);
}
.sidebar.is-expanded { width: 216px; }

.sidebar-header { display: flex; align-items: center; height: 72px; flex-shrink: 0; }
.sidebar-toggle {
  width: var(--mp-sizes-9); height: var(--mp-sizes-9);
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--mp-radii-md); cursor: pointer;
  background: transparent; border: none;
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-1);
  flex-shrink: 0; transition: background-color 100ms;
}
.sidebar-toggle:hover { background-color: var(--mp-background-neutral-subtle-hovered); }
.sidebar-toggle img {
  width: var(--mp-sizes-6); height: var(--mp-sizes-6); display: block; flex-shrink: 0;
  filter: brightness(0) opacity(0.6); transform: scaleX(-1);
  transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar.is-expanded .sidebar-toggle img { transform: scaleX(1); }

.nav-group {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5);
  padding-bottom: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-1);
  border-bottom: 1px solid var(--mp-border-default);
}
.nav-group:last-child { border-bottom: none; }

.nav-item {
  display: flex; align-items: center; justify-content: flex-start;
  gap: var(--mp-spacing-2);
  width: var(--mp-sizes-9); height: var(--mp-sizes-9);
  border-radius: var(--mp-radii-md); border: none; background: transparent;
  cursor: pointer; padding: var(--mp-spacing-2); overflow: hidden;
  color: var(--mp-text-default);
  transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1), background-color 100ms;
}
.sidebar.is-expanded .nav-item { width: 100%; }

/* Hover / flyout-open — same colours as ErpSidebar (icon tinted blue) */
.nav-item:hover, .nav-item.is-flyout-open { background-color: var(--mp-background-neutral-subtle-hovered); }
.nav-item:hover .nav-label, .nav-item.is-flyout-open .nav-label { color: var(--mp-text-link, #165082); }
.nav-item:hover img, .nav-item.is-flyout-open img { filter: brightness(0) saturate(100%) invert(26%) sepia(60%) saturate(600%) hue-rotate(185deg) brightness(85%) contrast(95%); }

/* Active — neutral-pressed bg, blue label, SOLID (fill) green icon (ErpSidebar) */
.nav-item.active { background-color: var(--mp-background-neutral-pressed); }
.nav-item.active .nav-label { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link, #165082); }
.nav-item.active .nav-icon-line { display: none; }
.nav-item .nav-icon-fill { display: none; }
.nav-item.active .nav-icon-fill {
  display: block;
  filter: brightness(0) saturate(100%) invert(35%) sepia(55%) saturate(700%) hue-rotate(120deg) brightness(90%) contrast(100%);
}

.nav-item img { width: var(--mp-sizes-5); height: var(--mp-sizes-5); display: block; flex-shrink: 0; pointer-events: none; }

.nav-label {
  flex: 1; min-width: 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: inherit; line-height: var(--mp-line-heights-md);
  opacity: 0; overflow: hidden; white-space: nowrap; text-align: left; pointer-events: none;
  transition: opacity 140ms ease;
}
.sidebar.is-expanded .nav-label { opacity: 1; }

/* ── Level-2 secondary panel — identical to ErpSidebar ── */
.sidebar-panel {
  width: 188px; background: var(--mp-background-neutral-subtle); height: 100%;
  display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto;
  padding: 0 var(--mp-spacing-2) var(--mp-spacing-2);
}
/* On phones the 52px rail + 188px panel leaves the content too little room, so
   the level-2 panel is dropped there (the icon rail + hover flyout remain). */
@media (max-width: 640px) {
  .sidebar-panel { display: none; }
}
.panel-header { height: 72px; display: flex; align-items: center; padding: 0 var(--mp-spacing-2); flex-shrink: 0; }
.panel-title { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 2.88px; color: var(--mp-text-default); }
/* Employee-profile panel: 80px round avatar + name + position + status, centered */
.panel-header--profile { height: auto; flex-direction: column; align-items: center; justify-content: center; gap: 0; text-align: center; padding: var(--mp-spacing-6) var(--mp-spacing-2) var(--mp-spacing-8); }
.profile-avatar { width: 80px; height: 80px; border-radius: var(--mp-radii-full, 999px); object-fit: cover; flex-shrink: 0; }
.profile-avatar--placeholder { display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: var(--mp-font-weights-semi-bold); }
/* 12px avatar→name; a tight 4px name→position and position→badge (line-heights
   pinned so the visual gap is really 4px). */
.profile-name { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: 24px; color: var(--mp-text-default); }
.profile-position { margin: 4px 0 0; font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular); line-height: 18px; color: var(--mp-text-secondary); }
.profile-badge { margin-top: 4px; display: inline-flex; }
.panel-list { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.panel-divider { height: 1px; background: var(--mp-border-default); margin: var(--mp-spacing-1) 0; }
.panel-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  width: 100%; padding: var(--mp-spacing-2); border-radius: var(--mp-radii-md); border: none; background: transparent;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default);
  cursor: pointer; text-align: left; line-height: var(--mp-line-heights-md); transition: background-color 100ms;
}
.panel-item:hover { background-color: var(--mp-background-neutral-subtle-hovered); }
.panel-item.active { background-color: #E2E8F0; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link, #165082); }
/* Accordion header (Employee profile, Time management, …) — chevron rotates when open */
.panel-accordion-chevron { flex-shrink: 0; color: var(--mp-icon-default, var(--mp-text-secondary)); transition: transform 150ms; }
.panel-item--accordion { font-weight: var(--mp-font-weights-regular); }
.panel-item--accordion.is-open .panel-accordion-chevron { transform: rotate(180deg); }
/* A child is active → tint the parent header (like the hover state). */
.panel-item--accordion.is-active-parent { background-color: var(--mp-background-neutral-subtle-hovered); }
/* Accordion children — indented, secondary text */
.panel-item--child { padding-left: var(--mp-spacing-3); padding-right: var(--mp-spacing-3); color: var(--mp-text-secondary); }
.panel-item--child.active { color: var(--mp-text-link, #165082); }

/* Panel slide-in */
.panel-enter-active, .panel-leave-active { transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease; overflow: hidden; }
.panel-enter-from, .panel-leave-to { width: 0; opacity: 0; }
.panel-enter-to, .panel-leave-from { width: 188px; opacity: 1; }

/* ── Flyout popover — identical to ErpSidebar ── */
.submenu-flyout {
  position: fixed; z-index: 1000; width: 188px;
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  box-shadow: var(--mp-shadows-sm);
  padding: var(--mp-spacing-2) 0;
  font-family: var(--mp-fonts-body);
}
.submenu-flyout::before {
  content: ''; position: absolute; top: 0;
  left: calc(-1 * var(--mp-spacing-3)); width: var(--mp-spacing-3); height: 100%;
}
.submenu-group { display: flex; flex-direction: column; }
.submenu-group.has-border { border-bottom: 1px solid var(--mp-border-default); padding-bottom: var(--mp-spacing-2); }
.submenu-group + .submenu-group { padding-top: var(--mp-spacing-2); }
.submenu-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  width: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: transparent; border: none; cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default); text-align: left; line-height: var(--mp-line-heights-md);
  transition: background-color 100ms;
}
.submenu-item:hover { background-color: var(--mp-background-neutral-subtle-hovered); }
.submenu-item.active { background-color: #E2E8F0; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link, #165082); }
</style>
