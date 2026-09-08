<script setup lang="ts">
/**
 * CRM (Qontak) product sidebar — shown while the CRM product is active (/crm*).
 *
 * Level-1 icon rail + an ERP-style level-2 PANEL (same mechanism as ErpSidebar):
 * a nav item with `children` (Customers → Companies · Contacts) opens the 188px
 * secondary panel and the rail collapses to icons, exactly like Sales in the ERP.
 */
import { ref, computed } from 'vue'
import { useLocale } from '~/composables/useLocale'
import toggleIcon from '~/assets/images/sidebar-toggle.svg?url'

const router = useRouter()
const route = useRoute()
const { t } = useLocale()

const expanded = ref(true)
function handleToggle() { expanded.value = !expanded.value }

const isNarrowViewport = ref(false)
if (import.meta.client) {
  const mq = window.matchMedia('(max-width: 1024px)')
  isNarrowViewport.value = mq.matches
  mq.addEventListener('change', (e) => { isNarrowViewport.value = e.matches })
}

interface Child { name: string; to: string }
interface Item { icon: string; name: string; to: string; children?: Child[] }
// Two groups → the border-bottom between them is the divider (Contacts | Activity logs).
const navGroups: Item[][] = [
  [
    { icon: 'pipeline', name: 'Deals',    to: '/crm/deals' },
    { icon: 'reports',  name: 'Reports',  to: '/crm/reports' },
    { icon: 'contact',  name: 'Contacts', to: '/crm/contacts' },
  ],
  [
    { icon: 'log',      name: 'Activity logs', to: '/crm/activity' },
    { icon: 'settings', name: 'Settings',      to: '/crm/settings', children: [
      { name: 'Company profile',  to: '/crm/settings/company' },
      { name: 'User & roles',     to: '/crm/settings/users' },
      { name: 'Teams',            to: '/crm/settings/teams' },
      { name: 'Modules settings', to: '/crm/settings/modules' },
    ] },
  ],
]

const activeItem = computed<string>(() => {
  if (route.path === '/crm' || route.path === '/crm/deals' || route.path.startsWith('/crm/deals/')) return 'Deals'
  if (route.path === '/crm/settings' || route.path.startsWith('/crm/settings/')) return 'Settings'
  for (const g of navGroups) for (const it of g)
    if (route.path === it.to || route.path.startsWith(it.to + '/')) return it.name
  return 'Deals'
})

// Level-2 panel: opens whenever the active section has children (e.g. Customers).
const activePanel = computed<Item | null>(() => {
  for (const g of navGroups) for (const it of g)
    if (it.name === activeItem.value && it.children?.length) return it
  return null
})

// Rail collapses to the icon rail while a level-2 panel is open (ERP behavior).
const navExpanded = computed(() => expanded.value && !isNarrowViewport.value && !activePanel.value)

function isChildActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + '/')
}
function handleNavClick(item: Item) { router.push(item.children?.length ? item.children[0]!.to : item.to) }
</script>

<template>
  <div class="sidebar-wrapper">
    <nav class="sidebar" :class="{ 'is-expanded': navExpanded }" aria-label="CRM navigation">
      <!-- Toggle -->
      <div class="sidebar-header">
        <button class="sidebar-toggle" type="button" title="Toggle sidebar" @click="handleToggle">
          <img :src="toggleIcon" alt="Toggle sidebar">
        </button>
      </div>

      <!-- Level-1 nav rail -->
      <div v-for="(group, gi) in navGroups" :key="gi" class="nav-group">
        <button
          v-for="item in group"
          :key="item.name"
          class="nav-item"
          :class="{ active: activeItem === item.name }"
          :title="t(item.name)"
          type="button"
          @click="handleNavClick(item)"
        >
          <img :src="`https://cdn.mekari.design/icons/${item.icon}-outline.svg`" class="nav-icon-line" alt="">
          <img :src="`https://cdn.mekari.design/icons/${item.icon}-fill.svg`" class="nav-icon-fill" alt="">
          <span class="nav-label">{{ t(item.name) }}</span>
        </button>
      </div>
    </nav>

    <!-- Level-2 panel (ERP .sidebar-panel) — Customers → Companies · Contacts -->
    <Transition name="panel">
      <div v-if="activePanel && !isNarrowViewport" class="sidebar-panel">
        <div class="panel-header">
          <span class="panel-title">{{ t(activePanel.name).toUpperCase() }}</span>
        </div>
        <div class="panel-list">
          <button
            v-for="child in activePanel.children"
            :key="child.name"
            class="panel-item"
            :class="{ active: isChildActive(child.to) }"
            type="button"
            @click="router.push(child.to)"
          >
            <span>{{ t(child.name) }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.sidebar-wrapper { display: flex; height: 100%; flex-shrink: 0; }

.sidebar {
  width: 52px;
  background: var(--mp-background-neutral-subtle);
  display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden;
  transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1); will-change: width;
  padding: 0 var(--mp-spacing-2) var(--mp-spacing-2);
}
.sidebar.is-expanded { width: 216px; }

.sidebar-header { display: flex; align-items: center; height: 72px; flex-shrink: 0; }
.sidebar-toggle {
  width: var(--mp-sizes-9); height: var(--mp-sizes-9);
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--mp-radii-md); cursor: pointer; background: transparent; border: none;
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
  display: flex; align-items: center; justify-content: flex-start; gap: var(--mp-spacing-2);
  width: var(--mp-sizes-9); height: var(--mp-sizes-9);
  border-radius: var(--mp-radii-md); border: none; background: transparent;
  cursor: pointer; padding: var(--mp-spacing-2); overflow: hidden;
  transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1), background-color 100ms;
}
.sidebar.is-expanded .nav-item { width: 100%; }
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

.nav-item img { width: var(--mp-sizes-5); height: var(--mp-sizes-5); display: block; flex-shrink: 0; pointer-events: none; }

.nav-label {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
  opacity: 0; overflow: hidden; white-space: nowrap; pointer-events: none; transition: opacity 140ms ease;
}
.sidebar.is-expanded .nav-label { opacity: 1; }

/* ── Level-2 panel (mirrors ErpSidebar .sidebar-panel) ── */
.sidebar-panel {
  width: 188px; background: var(--mp-background-neutral-subtle); height: 100%;
  display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto;
  padding: 0 var(--mp-spacing-2) var(--mp-spacing-2);
}
.panel-header { height: 72px; display: flex; align-items: center; padding: 0 var(--mp-spacing-2); flex-shrink: 0; }
.panel-title { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 2.88px; color: var(--mp-text-default); }
.panel-list { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.panel-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  width: 100%; padding: var(--mp-spacing-2); border-radius: var(--mp-radii-md); border: none; background: transparent;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default);
  cursor: pointer; text-align: left; line-height: var(--mp-line-heights-md); transition: background-color 100ms;
}
.panel-item:hover { background-color: var(--mp-background-neutral-subtle-hovered); }
.panel-item.active { background-color: var(--mp-background-neutral-pressed, #E2E8F0); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link, #165082); }

/* Slide-in transition */
.panel-enter-active, .panel-leave-active { transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease; overflow: hidden; }
.panel-enter-from, .panel-leave-to { width: 0; opacity: 0; }
.panel-enter-to, .panel-leave-from { width: 188px; opacity: 1; }
</style>
