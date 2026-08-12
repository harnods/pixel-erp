<script setup lang="ts">
/**
 * HR (Talenta) product sidebar — shown while the HR product is active (/hr*).
 * Mirrors the ERP sidebar's collapsed-rail behaviour (52px → 216px on toggle)
 * but carries the Talenta module menu, Pixel icons, and Talenta's indigo accent.
 * Menu mirrors talenta-core's app/data/menu.ts top level.
 */
import { ref, computed } from 'vue'
import { MpIcon, toast } from '@mekari/pixel3'
import toggleIcon from '~/assets/images/sidebar-toggle.svg?url'

const router = useRouter()
const route = useRoute()

const expanded = ref(false)

interface Item { icon: string; label: string; to?: string; chevron?: boolean }
const groups: Item[][] = [
  [
    { icon: 'home',         label: 'Home', to: '/hr' },
    { icon: 'profile',      label: 'Employee profile' },
    { icon: 'team',         label: 'Employees',    chevron: true },
    { icon: 'people',       label: 'Recruitment',  chevron: true },
    { icon: 'time',         label: 'Time',         chevron: true },
    { icon: 'finance',      label: 'Finance',      chevron: true },
    { icon: 'calculator',   label: 'Payroll',      chevron: true },
    { icon: 'productivity', label: 'Productivity', chevron: true },
    { icon: 'company',      label: 'Company',      chevron: true },
  ],
  [
    { icon: 'application', label: 'Applications', chevron: true },
    { icon: 'add-ons',     label: 'Integrations' },
  ],
  [
    { icon: 'settings', label: 'Settings' },
  ],
]

const isActive = (item: Item) => item.label === 'Home' && route.path.startsWith('/hr')

function onClick(item: Item) {
  if (item.to) router.push(item.to)
  else toast.notify({ variant: 'info', title: `${item.label} — coming soon`, maxWidth: 'max-content' })
}
</script>

<template>
  <div class="sidebar-wrapper">
    <nav class="sidebar hr-sidebar" :class="{ 'is-expanded': expanded }" aria-label="HR navigation">
      <div class="sidebar-header">
        <button class="sidebar-toggle" title="Toggle sidebar" @click="expanded = !expanded">
          <img :src="toggleIcon" alt="Toggle sidebar">
        </button>
      </div>

      <div v-for="(group, gi) in groups" :key="gi" class="nav-group">
        <button
          v-for="item in group"
          :key="item.label"
          class="nav-item"
          :class="{ active: isActive(item) }"
          :title="item.label"
          @click="onClick(item)"
        >
          <MpIcon :name="item.icon" size="md" class="nav-icon" />
          <span class="nav-label">{{ item.label }}</span>
          <svg v-if="item.chevron" class="nav-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
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
  color: var(--mp-text-default);
  transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1), background-color 100ms;
}
.sidebar.is-expanded .nav-item { width: 100%; }
.nav-item:hover { background-color: var(--mp-background-neutral-subtle-hovered); }
.nav-item.active { background-color: var(--mp-airene-subtle, #ede9fe); color: var(--mp-airene-bold, #5a41d6); }

.nav-icon { flex-shrink: 0; }
.nav-item :deep(svg) { color: var(--mp-icon-nav, #758195); }
.nav-item.active :deep(svg) { color: var(--mp-airene-bold, #5a41d6); }

.nav-label {
  flex: 1; min-width: 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: inherit; line-height: var(--mp-line-heights-md);
  opacity: 0; overflow: hidden; white-space: nowrap; text-align: left; pointer-events: none;
  transition: opacity 140ms ease;
}
.nav-item.active .nav-label { font-weight: var(--mp-font-weights-semi-bold); }
.sidebar.is-expanded .nav-label { opacity: 1; }

.nav-chevron {
  flex-shrink: 0; color: var(--mp-text-secondary);
  opacity: 0; transition: opacity 140ms ease;
}
.sidebar.is-expanded .nav-chevron { opacity: 1; }
.nav-item.active .nav-chevron { color: inherit; }
</style>
