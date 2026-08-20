<script setup lang="ts">
/**
 * CRM (Qontak) product sidebar — shown while the CRM product is active (/crm*).
 *
 * CRM has NO level-2 menu: a single level-1 rail only (Home, Deals, Orders,
 * Tasks, Customers, Products, then a divider before Settings). Visuals mirror
 * ErpSidebar's level-1 rail (52px collapsed / 216px expanded, CDN outline/fill
 * icons, hover → link blue, active → pressed bg + fill icon).
 */
import { ref, computed } from 'vue'
import { useLocale } from '~/composables/useLocale'
import toggleIcon from '~/assets/images/sidebar-toggle.svg?url'

const router = useRouter()
const route = useRoute()
const { t } = useLocale()

const expanded = ref(true)
function handleToggle() { expanded.value = !expanded.value }
// Below tablet width the expanded nav (216px) starves the content area, so we
// force the collapsed icon rail there regardless of the saved preference
// (mirrors ErpSidebar).
const isNarrowViewport = ref(false)
if (import.meta.client) {
  const mq = window.matchMedia('(max-width: 1024px)')
  isNarrowViewport.value = mq.matches
  mq.addEventListener('change', (e) => { isNarrowViewport.value = e.matches })
}
const navExpanded = computed(() => expanded.value && !isNarrowViewport.value)

interface Item { icon: string; name: string; to: string }
// Two groups → the border-bottom between them is the divider before Settings.
const navGroups: Item[][] = [
  [
    { icon: 'pipeline',     name: 'Deals',     to: '/crm/deals' },
    { icon: 'cart',         name: 'Orders',    to: '/crm/orders' },
    { icon: 'productivity', name: 'Tasks',     to: '/crm/tasks' },
    { icon: 'contact',      name: 'Customers', to: '/crm/customers' },
    { icon: 'products',     name: 'Products',  to: '/crm/products' },
  ],
  [
    { icon: 'settings', name: 'Settings', to: '/crm/settings' },
  ],
]

const activeItem = computed<string>(() => {
  // /crm (bare) lands on Deals, so treat it as Deals-active too.
  if (route.path === '/crm' || route.path === '/crm/deals' || route.path.startsWith('/crm/deals/')) return 'Deals'
  for (const g of navGroups) for (const it of g)
    if (route.path === it.to || route.path.startsWith(it.to + '/')) return it.name
  return 'Deals'
})

function handleNavClick(item: Item) { router.push(item.to) }
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

      <!-- Nav groups (level-1 only; group boundary = divider) -->
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
  </div>
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
  opacity: 0; overflow: hidden; white-space: nowrap; pointer-events: none;
  transition: opacity 140ms ease;
}
.sidebar.is-expanded .nav-label { opacity: 1; }
</style>
