<script setup lang="ts">
/**
 * Navbar group — the far-left product-switcher rail (leftmost column, before the
 * level-1 nav). Each product is an icon + label stacked vertically. Dark green,
 * same base as the header bar; white icons/labels, active product highlighted.
 * Icons live in /public/nav-rail (design-provided SVGs, forced white via filter).
 * Layout mirrors Figma "Menu Group" (node 4141:450).
 */
import { computed } from 'vue'
import { toast } from '@mekari/pixel3'

interface RailItem { key: string; label: string; icon: string; to?: string }
const railItems: RailItem[] = [
  { key: 'ERP',   label: 'ERP',   icon: 'application', to: '/'    },
  { key: 'HR',    label: 'HR',    icon: 'employee',    to: '/hr'  },
  { key: 'CRM',   label: 'CRM',   icon: 'pipeline',    to: '/crm' },
  { key: 'Tax',   label: 'Tax',   icon: 'promo'       },
  { key: 'Spend', label: 'Spend', icon: 'finance'     },
  { key: 'Store', label: 'Store', icon: 'shop'        },
  { key: 'POS',   label: 'POS',   icon: 'calculator'  },
]

const router = useRouter()
const route = useRoute()
// Active product follows the route: /hr* → HR, /crm* → CRM, everything else → ERP.
const activeProduct = computed(() =>
  route.path.startsWith('/hr') ? 'HR' : route.path.startsWith('/crm') ? 'CRM' : 'ERP')

function openProduct(item: RailItem) {
  if (item.to) router.push(item.to)
  else toast.notify({ variant: 'info', title: `${item.label} — coming soon`, maxWidth: 'max-content' })
}
</script>

<template>
  <nav class="navbar-group" aria-label="Product navigation">
    <button
      v-for="item in railItems"
      :key="item.key"
      class="ng-item"
      :class="{ active: activeProduct === item.key }"
      :aria-label="item.label"
      :aria-current="activeProduct === item.key ? 'page' : undefined"
      @click="openProduct(item)"
    >
      <span class="ng-icon-box">
        <img :src="`/nav-rail/${item.icon}.svg`" class="ng-icon" alt="" />
      </span>
      <span class="ng-label">{{ item.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.navbar-group {
  width: 56px;
  flex-shrink: 0;
  background: var(--mp-background-surface-bold);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-3);             /* 12px between products */
  padding: var(--mp-spacing-4) var(--mp-spacing-0\.5) 0;  /* 16px top, 2px sides */
  overflow-y: auto;
  overflow-x: hidden;
}

/* Each product = icon box + label stacked, centered. */
.ng-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-0\.5);          /* 2px between icon and label */
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.ng-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9);             /* 36px button box */
  height: var(--mp-sizes-9);
  border-radius: var(--mp-radii-md);
  transition: background-color 100ms;
}
.ng-item:hover .ng-icon-box { background-color: rgba(235, 240, 241, 0.10); }
.ng-item.active .ng-icon-box { background-color: rgba(235, 240, 241, 0.20); }

.ng-icon {
  width: var(--mp-sizes-5);             /* 20px */
  height: var(--mp-sizes-5);
  display: block;
  flex-shrink: 0;
  pointer-events: none;
  filter: brightness(0) invert(1);      /* white fill */
}

.ng-label {
  font-size: var(--mp-font-sizes-sm);   /* 12px */
  line-height: var(--mp-line-heights-sm, 16px);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-inverse);        /* white */
  text-align: center;
  white-space: nowrap;
}
</style>
