<script setup lang="ts">
import { watch, computed } from 'vue'
import { MpBadge, MpToastManager } from '@mekari/pixel3'
import { ruleMeaning, FOUNDATION_RULES } from '~/data/pixelRules'

definePageMeta({ layout: false })
useHead({ title: 'Pixel 3 · Enterprise components — Mekari ERP' })

// Right rail: the rules governing the page currently open (set by each page's
// DemoHeader). Clear on navigation so a page without rules shows an empty rail.
const route = useRoute()
const pageRules = usePixelRules()
watch(() => route.path, () => { pageRules.value = [] })

// Always show the rail; when a page declares no rules, fall back to the foundations.
const railRules = computed(() => (pageRules.value.length ? pageRules.value : FOUNDATION_RULES))
const railIsFoundation = computed(() => pageRules.value.length === 0)

// Pattern pages (full-width layouts like the filter bar) get a wider content column
// so they render the way a real full-width index page does — not the narrow gallery column.
const WIDE_PAGES = ['/pixel/filter-bar']
const isWide = computed(() => WIDE_PAGES.includes(route.path))

// Sidebar nav — every component is its own page under /pixel/<slug>
const sidebar = [
  {
    label: 'Actions', items: [
      { slug: 'button', label: 'Button' },
      { slug: 'erp-button', label: 'ERP button (deprecated)' },
      { slug: 'button-group', label: 'Button group' },
    ],
  },
  {
    label: 'Forms & inputs', items: [
      { slug: 'input', label: 'Input' },
      { slug: 'input-group', label: 'Input group' },
      { slug: 'textarea', label: 'Textarea' },
      { slug: 'select', label: 'Select' },
      { slug: 'filter-select', label: 'Dropdown' },
      { slug: 'checkbox', label: 'Checkbox' },
      { slug: 'radio', label: 'Radio' },
      { slug: 'toggle', label: 'Toggle' },
      { slug: 'slider', label: 'Slider' },
      { slug: 'rating', label: 'Rating' },
      { slug: 'date-picker', label: 'Date picker' },
      { slug: 'input-tag', label: 'Input tag' },
      { slug: 'segmented-control', label: 'Segmented control' },
      { slug: 'form-control', label: 'Form control' },
    ],
  },
  {
    label: 'Data display', items: [
      { slug: 'badge', label: 'Badge' },
      { slug: 'status-badge', label: 'Status badge' },
      { slug: 'tag', label: 'Tag' },
      { slug: 'tag-list', label: 'Tag list' },
      { slug: 'avatar', label: 'Avatar' },
      { slug: 'text-link', label: 'Text & link' },
      { slug: 'divider', label: 'Divider' },
      { slug: 'progress', label: 'Progress' },
      { slug: 'content-list', label: 'Content list' },
      { slug: 'table', label: 'Table' },
      { slug: 'accordion', label: 'Accordion' },
      { slug: 'timeline', label: 'Timeline' },
    ],
  },
  {
    label: 'Feedback & overlays', items: [
      { slug: 'banner', label: 'Banner' },
      { slug: 'toast', label: 'Toast' },
      { slug: 'tooltip', label: 'Tooltip' },
      { slug: 'spinner', label: 'Spinner / Loader' },
      { slug: 'skeleton', label: 'Skeleton' },
      { slug: 'modal', label: 'Modal' },
      { slug: 'drawer', label: 'Drawer' },
    ],
  },
  {
    label: 'Navigation', items: [
      { slug: 'tabs', label: 'Tabs' },
      { slug: 'popover', label: 'Popover' },
    ],
  },
  {
    label: 'Patterns', items: [
      { slug: 'filter-bar', label: 'Filter bar' },
    ],
  },
  {
    label: 'Reference', items: [
      { slug: 'overrides', label: 'ERP overrides' },
      { slug: 'agents', label: 'For AI agents' },
    ],
  },
]
</script>

<template>
  <div class="px">
    <aside class="pxside">
      <NuxtLink to="/pixel" class="pxside__brand">
        <span class="pxside__mark">◆</span>
        <span class="pxside__word">Pixel 3</span>
        <MpBadge for="additionalInformation" type="announcement" size="sm">Enterprise</MpBadge>
      </NuxtLink>
      <nav class="pxside__nav">
        <div v-for="grp in sidebar" :key="grp.label" class="pxside__group">
          <span class="pxside__grouplabel">{{ grp.label }}</span>
          <NuxtLink
            v-for="it in grp.items"
            :key="it.slug"
            :to="`/pixel/${it.slug}`"
            class="pxside__item"
          >{{ it.label }}</NuxtLink>
        </div>
      </nav>
    </aside>

    <main class="pxmain">
      <div class="pxcontent" :class="{ 'pxcontent--wide': isWide }">
        <NuxtPage />
      </div>
    </main>

    <aside class="pxrail">
      <div class="pxrail__head">{{ railIsFoundation ? 'Foundations (apply to every component)' : 'Rules on this page' }}</div>
      <table class="pxrail__table">
        <tbody>
          <tr v-for="r in railRules" :key="r">
            <td class="pxrail__id"><code>{{ r }}</code></td>
            <td class="pxrail__mean">{{ ruleMeaning(r) }}</td>
          </tr>
        </tbody>
      </table>
      <a class="pxrail__more" href="/pixel/overrides">Full registry → docs/design/RULES.md</a>
    </aside>

    <MpToastManager />
  </div>
</template>

<style scoped>
.px {
  display: flex;
  min-height: 100vh;
  background: var(--mp-background-stage, #fff);
  color: var(--mp-text-default, #0a0a0a);
  font-family: var(--mp-font-families-body, Inter, sans-serif);
}
.pxside {
  position: sticky;
  top: 0;
  align-self: flex-start;
  width: 16rem;
  flex: 0 0 16rem;
  height: 100vh;
  overflow-y: auto;
  border-right: 1px solid var(--mp-border-subtle, #e5e7e7);
  padding: var(--mp-spacing-5) var(--mp-spacing-4);
  background: var(--mp-background-stage, #fff);
}
.pxside__brand {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: 0 var(--mp-spacing-2) var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-subtle, #e5e7e7);
  text-decoration: none;
  color: inherit;
}
.pxside__mark { color: var(--mp-background-brand-bold, #029861); }
.pxside__word { font-weight: var(--mp-font-weights-bold); }
.pxside__nav { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-3); }
.pxside__group { display: flex; flex-direction: column; }
.pxside__grouplabel {
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--mp-text-secondary);
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  margin-bottom: var(--mp-spacing-1);
}
.pxside__item {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  text-decoration: none;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm, 4px);
}
.pxside__item:hover { background: var(--mp-background-neutral-subtle, #f5f6f6); }
.pxside__item.router-link-active {
  background: var(--mp-background-neutral-subtle, #f5f6f6);
  color: var(--mp-text-link, #0a6e4e);
  font-weight: var(--mp-font-weights-semi-bold);
}
.pxmain { flex: 1 1 auto; min-width: 0; }
.pxcontent { max-width: 52rem; margin: 0 auto; padding: var(--mp-spacing-8) var(--mp-spacing-8) var(--mp-spacing-9); }
.pxcontent--wide { max-width: 72rem; } /* pattern pages (e.g. filter bar) — real page width, one line */

/* Right rail — rules governing the current page */
.pxrail {
  position: sticky;
  top: 0;
  align-self: flex-start;
  width: 27rem;
  flex: 0 0 27rem;
  height: 100vh;
  overflow-y: auto;
  border-left: 1px solid var(--mp-border-subtle, #e5e7e7);
  padding: var(--mp-spacing-8) var(--mp-spacing-6);
  background: var(--mp-background-stage, #fff);
}
.pxrail__head {
  font-size: var(--mp-font-sizes-sm, 0.875rem);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--mp-text-secondary);
  margin-bottom: var(--mp-spacing-4);
}
.pxrail__table { width: 100%; border-collapse: collapse; }
.pxrail__table tr { border-top: 1px solid var(--mp-border-subtle, #e5e7e7); }
.pxrail__table tr:first-child { border-top: none; }
.pxrail__id {
  padding: var(--mp-spacing-2) var(--mp-spacing-6) var(--mp-spacing-2) 0; /* 8px top/bottom · 24px gap */
  vertical-align: top;
  width: 11rem;
}
.pxrail__id code {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-sm, 0.875rem);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-link, #0a6e4e);
  word-break: break-word;
}
.pxrail__mean {
  padding: var(--mp-spacing-2) 0; /* 8px top/bottom */
  vertical-align: top;
  font-size: var(--mp-font-sizes-md, 0.9375rem);
  color: var(--mp-text-default);
  line-height: 1.6;
}
.pxrail__more {
  display: inline-block;
  margin-top: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm, 0.875rem);
  color: var(--mp-text-secondary);
  text-decoration: none;
}
.pxrail__more:hover { color: var(--mp-text-default); }

@media (max-width: 82rem) {
  .pxrail { display: none; }
}
@media (max-width: 60rem) {
  .pxside { display: none; }
}
</style>
