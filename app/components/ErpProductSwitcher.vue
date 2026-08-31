<script setup lang="ts">
/**
 * Product switcher — the "categories" icon button at the far-left of the header
 * (shown only when the product rail / ErpNavbarGroup is hidden, i.e. the default
 * scenario). Clicking opens the product popover (Figma node 4143:3732): a company
 * header + the product list (ERP / HR / CRM / Tax / Trip & expense / Sales channel
 * / POS). ERP/HR/CRM/Tax navigate; the rest are placeholders.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { infoToast } from '~/utils/toasts'
import { toast } from '@mekari/pixel3'
import { isHrPath } from '~/utils/hrRoutes'

const router = useRouter()
const route = useRoute()
const { activeScenario, setScenario } = useScenario()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

// Company switcher — the header row expands to pick a company.
const companyOpen = ref(false)
const companies = ['PT Central Perk Indonesia', 'Central Perk Roastery Co.', 'Central Perk Retail Group']
const activeCompany = ref(companies[0]!)
function chooseCompany(name: string) { activeCompany.value = name; companyOpen.value = false }

interface Product { key: string; label: string; icon: string; to?: string; scenario?: Scenario }
const products: Product[] = [
  { key: 'ERP',   label: 'ERP',               icon: 'application',   to: '/', scenario: 'ERP' },
  { key: 'HR',    label: 'HR',                icon: 'employee',      to: '/hr', scenario: 'ERP' },
  { key: 'CRM',   label: 'CRM',               icon: 'pipeline',      to: '/crm', scenario: 'ERP' },
  { key: 'Tax',   label: 'Tax',               icon: 'promo',         to: '/tax', scenario: 'ERP' },
  // Spend management = the XPM (Mekari Expense) scenario. Selecting it flips the
  // scenario (so the sidebar swaps to the Expense nav) and lands on its Home.
  { key: 'XPM',   label: 'Spend management',  icon: 'wallet',        to: '/', scenario: 'XPM' },
  { key: 'Sales', label: 'Sales channel',     icon: 'shop' },
  { key: 'POS',   label: 'POS',               icon: 'calculator' },
]

const activeKey = computed(() =>
  activeScenario.value === 'XPM' ? 'XPM'
    : activeScenario.value === 'BUZZ' ? 'BUZZ'
    : isHrPath(route.path) ? 'HR'
    : route.path.startsWith('/crm') ? 'CRM'
    : route.path.startsWith('/tax') ? 'Tax'
    : 'ERP')

function choose(p: Product) {
  open.value = false
  if (p.to) {
    // Set the scenario BEFORE navigating so the sidebar + Home render the right
    // product on the first paint (ERP for ERP/HR/CRM/Tax, XPM for Spend management).
    if (p.scenario && p.scenario !== activeScenario.value) setScenario(p.scenario)
    router.push(p.to)
  } else {
    infoToast(`${p.label} — coming soon`)
  }
}

function onDocClick(e: MouseEvent) {
  if (open.value && rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false
}
function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') open.value = false }
onMounted(() => { document.addEventListener('mousedown', onDocClick); document.addEventListener('keydown', onEsc) })
onUnmounted(() => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onEsc) })
</script>

<template>
  <div ref="rootEl" class="ps">
    <button class="ps-trigger" type="button" aria-label="Switch product" :aria-expanded="open" @click="open = !open">
      <img src="https://cdn.mekari.design/icons/categories-outline.svg" class="ps-trigger-icon" alt="">
    </button>

    <Transition name="ps-fade">
      <div v-if="open" class="ps-popover" role="menu">
        <!-- Company header (click to expand company switcher) -->
        <button class="ps-company" type="button" :aria-expanded="companyOpen" @click="companyOpen = !companyOpen">
          <span class="ps-company-name">{{ activeCompany }}</span>
          <svg class="ps-company-chevron" :class="{ 'is-open': companyOpen }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>

        <!-- Company list (expanded) -->
        <div v-if="companyOpen" class="ps-company-list">
          <button
            v-for="co in companies"
            :key="co"
            class="ps-company-item"
            :class="{ 'ps-company-item--active': co === activeCompany }"
            type="button"
            @click="chooseCompany(co)"
          >
            <span class="ps-company-item-label">{{ co }}</span>
            <svg v-if="co === activeCompany" class="ps-company-check" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>

        <!-- Products -->
        <div v-show="!companyOpen" class="ps-list">
          <button
            v-for="p in products"
            :key="p.key"
            class="ps-item"
            :class="{ 'ps-item--active': p.key === activeKey }"
            type="button"
            role="menuitem"
            @click="choose(p)"
          >
            <span class="ps-item-icon">
              <img :src="`https://cdn.mekari.design/icons/${p.icon}-outline.svg`" class="ps-icon" alt="">
            </span>
            <span class="ps-item-label">{{ p.label }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ps { position: relative; display: inline-flex; }

/* Trigger — dark inverse fill, 36×36, 20px categories icon (white). */
.ps-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; padding: var(--mp-spacing-2);
  border: none; border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-background-inverse, #1d2125); cursor: pointer;
  transition: background-color 100ms;
}
.ps-trigger:hover { background: var(--mp-background-inverse-bold-hovered, #3a3f47); }
.ps-trigger-icon { width: 20px; height: 20px; display: block; filter: brightness(0) invert(1); }

/* Popover — Figma 4143:3732: 280px, bold border, md radius, elevation-S, py 8px. */
.ps-popover {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 1200;
  width: 280px; padding: var(--mp-spacing-2) 0;
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-bold, #758195);
  border-radius: var(--mp-radii-md, 6px);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
}

/* Company header row (button) */
.ps-company {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 100%;
  padding: var(--mp-spacing-3);
  border: none; border-bottom: 1px solid var(--mp-border-default-subtle, #f0f1f3);
  background: transparent; cursor: pointer; text-align: left;
}
.ps-company:hover { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.ps-company-name { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #272b32); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ps-company-chevron { flex-shrink: 0; color: var(--mp-text-secondary, #656f80); transition: transform 150ms; }
.ps-company-chevron.is-open { transform: rotate(180deg); }

/* Company list (expanded) */
.ps-company-list { display: flex; flex-direction: column; border-bottom: 1px solid var(--mp-border-default-subtle, #f0f1f3); }
.ps-company-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: none; background: transparent; cursor: pointer; text-align: left;
}
.ps-company-item:hover { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.ps-company-item--active { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.ps-company-item-label { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #272b32); }
.ps-company-check { flex-shrink: 0; color: var(--mp-text-selected, #0f6d4d); }

/* Product list */
.ps-list { display: flex; flex-direction: column; }
.ps-item {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: none; background: transparent; cursor: pointer; text-align: left; width: 100%;
  transition: background-color 100ms;
}
.ps-item:hover { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.ps-item--active { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.ps-item-icon { flex-shrink: 0; width: 20px; height: 20px; }
.ps-icon { width: 20px; height: 20px; display: block; }
/* Active product's icon reads green (matches the sidebar active state). */
.ps-item--active .ps-icon { filter: brightness(0) saturate(100%) invert(35%) sepia(55%) saturate(700%) hue-rotate(120deg) brightness(90%) contrast(100%); }
.ps-item-label { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #272b32); }

.ps-fade-enter-active, .ps-fade-leave-active { transition: opacity 120ms ease, transform 120ms ease; }
.ps-fade-enter-from, .ps-fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
