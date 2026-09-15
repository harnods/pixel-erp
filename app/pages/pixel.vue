<script setup lang="ts">
import { MpBadge, MpToastManager } from '@mekari/pixel3'

definePageMeta({ layout: false })
useHead({ title: 'Pixel 3 · Enterprise components — Mekari ERP' })

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
      { slug: 'select', label: 'Select (deprecated)' },
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
      { slug: 'status-badge', label: 'Status badge (deprecated)' },
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
      { slug: 'pattern-activity-log-modal', label: 'Activity log modal' },
      { slug: 'pattern-journal-entry-modal', label: 'Journal entry modal' },
      { slug: 'pattern-approval-log-modal', label: 'Approval log modal' },
      { slug: 'pattern-all-filters-drawer', label: 'All filters drawer' },
      { slug: 'pattern-select-product-drawer', label: 'Select product drawer' },
      { slug: 'pattern-import-modal', label: 'Import modal' },
      { slug: 'pattern-pdf-preview-modal', label: 'PDF preview modal' },
      { slug: 'pattern-image-preview-modal', label: 'Image preview modal' },
      { slug: 'pattern-jump-to', label: 'Jump to' },
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
      <div class="pxcontent">
        <NuxtPage />
      </div>
    </main>

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
.pxcontent { max-width: 52rem; margin: 0 auto; padding: var(--mp-spacing-8, 2rem) var(--mp-spacing-8, 2rem) var(--mp-spacing-9, 2.5rem); }

@media (max-width: 60rem) {
  .pxside { display: none; }
}
</style>
