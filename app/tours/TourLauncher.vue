<template>
  <!--
    Guided tours: the one launcher in the top bar, beside View as.
    This is a demo layer for walkthroughs, not a product requirement; engineers
    building the product should ignore it. The only coupling to product screens
    is the data-tour="..." attributes they carry.
    Always shown on every ERP screen, in the same place, for every module. It
    lists every module's tours (tourRegistry.ts), the current module's group first.
  -->
  <MpPopover
    id="guided-tours-launcher"
    placement="bottom-end"
    use-portal
    is-close-on-blur
    is-close-on-escape
    v-slot="{ onClosePopover }"
  >
    <MpPopoverTrigger>
      <MpButton class="gtl-trigger" variant="ghost" is-rounded right-icon="chevrons-down" data-tour="tours-launcher">
        Guided tours
      </MpButton>
    </MpPopoverTrigger>
    <MpPopoverContent class="erp-dropdown-menu gtl-menu">
      <div class="gtl-heading">Press Next and each tour does the step for you, then shows the result. Starting one resets that module's sample data.</div>
      <template v-for="g in groups" :key="g.key">
        <div class="gtl-group">{{ g.label }}</div>
        <MpPopoverList>
          <MpPopoverListItem
            v-for="t in g.tours"
            :key="t.id"
            :is-active="activeTour?.id === t.id"
            @click="start(t, onClosePopover)"
          >
            <span class="gtl-item">
              <span class="gtl-name">{{ t.code }} · {{ t.name }}</span>
              <span class="gtl-sub">{{ t.steps.length }} steps · {{ t.persona }}</span>
            </span>
          </MpPopoverListItem>
        </MpPopoverList>
      </template>
    </MpPopoverContent>
  </MpPopover>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import type { AssetTour } from './assetTours'
import { orderedGroups } from './tourRegistry'
import { activeTour, startTour } from './tourRunner'

const router = useRouter()
const route = useRoute()
const groups = computed(() => orderedGroups(route.path))

function start(t: AssetTour, closePopover: () => void) {
  closePopover()
  startTour(t, router)
}
</script>

<style scoped>
.gtl-trigger {
  color: var(--mp-colors-text-inverse, #fff);
}
.gtl-trigger:hover {
  background: var(--mp-colors-background-header-menu-hovered, rgba(255, 255, 255, 0.08));
}
.gtl-trigger :deep(svg) {
  fill: var(--mp-colors-icon-inverse, #fff);
}
:global(.mp-popover.gtl-menu) {
  min-width: 340px;
  max-height: calc(100vh - var(--mp-spacing-20, 80px));
  overflow-y: auto;
}
.gtl-group {
  padding: var(--mp-spacing-3) var(--mp-spacing-4) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-secondary);
  border-top: 1px solid var(--mp-colors-border-default, #d0d6dd);
}
.gtl-heading {
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-colors-text-secondary);
  max-width: var(--mp-sizes-sm, 24rem);
}
.gtl-item { display: flex; flex-direction: column; }
.gtl-name { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); }
.gtl-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
</style>

<style>
/*
 * The tour panel (tourPanel.ts). Global on purpose: MpTour renders into its own app under
 * #pixel-tour-portal, outside every scoped tree. The overlay is hidden so the
 * screen stays usable. The panel sits above drawers (1300) and below popovers
 * (1600), so a dropdown a step opens shows over it rather than under it.
 */
#asset-tour-overlay { display: none; }
#asset-tour { z-index: 1500; }
#asset-tour[data-centered] { position: fixed !important; }
#asset-tour[data-pinned] {
  position: fixed !important;
  inset: auto !important;
  transform: none !important;
}
#asset-tour[data-pinned^="t"] { top: calc(var(--mp-spacing-12, 48px) + var(--mp-spacing-4)) !important; }
#asset-tour[data-pinned^="b"] { bottom: var(--mp-spacing-4) !important; }
#asset-tour[data-pinned$="l"] { left: var(--mp-spacing-4) !important; }
#asset-tour[data-pinned$="r"] { right: var(--mp-spacing-4) !important; }
.asset-tour-target {
  outline: 2px solid var(--mp-colors-border-focused, #4b61dd);
  outline-offset: 2px;
  border-radius: var(--mp-radii-md);
}
.gt-panel {
  width: calc(var(--mp-sizes-sm, 24rem) + var(--mp-spacing-12, 48px));
  max-width: calc(100vw - var(--mp-spacing-8, 32px));
  max-height: calc(100vh - var(--mp-spacing-20, 80px));
  /* The body scrolls, not the panel: the footer stays reachable on a long step. */
  overflow: hidden;
  padding: var(--mp-spacing-4);
  background: var(--mp-colors-background-surface, #fff);
  border: 1px solid var(--mp-colors-border-default, #d0d6dd);
  border-radius: var(--mp-radii-lg, 8px);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
}
.gt-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.gt-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.gt-progress {
  flex: none;
  /* The house tab underline's weight, so the rail reads as app furniture. */
  height: 2px;
  border-radius: var(--mp-radii-sm, 4px);
  background: var(--mp-colors-border-default, #d0d6dd);
  overflow: hidden;
}
.gt-progress-fill {
  height: 100%;
  background: var(--mp-colors-border-success, #029861);
  transition: width 160ms ease;
}
.gt-title { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.gt-body { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
/*
 * One sentence per line, so a four-sentence explanation reads as four things
 * rather than one block.
 */
.gt-line { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-colors-text-secondary); }
.gt-block {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-3);
  border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-colors-background-neutral-subtle, #f8f9f9);
  border-left: 3px solid var(--mp-colors-border-default, #d0d6dd);
}
.gt-block--watch {
  background: var(--mp-colors-background-success, #e3fcef);
  border-left-color: var(--mp-colors-background-success-bold, #006644);
}
.gt-block--action {
  border-left-color: var(--mp-colors-text-secondary, #3a4749);
}
.gt-label {
  font-size: var(--mp-font-sizes-xs, 11px);
  font-weight: var(--mp-font-weights-bold, 700);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mp-colors-text-secondary);
}
.gt-text { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-colors-text-default); }
.gt-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.gt-item {
  position: relative;
  padding-left: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-colors-text-default);
}
/* The app resets list-style, so the marker is drawn rather than inherited. */
.gt-item::before {
  content: '';
  position: absolute;
  left: var(--mp-spacing-1);
  top: 0.6em;
  width: var(--mp-sizes-1, 4px);
  height: var(--mp-sizes-1, 4px);
  border-radius: 50%;
  background: var(--mp-colors-text-secondary, #3a4749);
}
/* Figures carry the step: tabular numerals keep columns of them comparable. */
.gt-fig {
  font-weight: var(--mp-font-weights-semi-bold);
  font-variant-numeric: tabular-nums;
  color: var(--mp-colors-text-default);
  white-space: nowrap;
}
.gt-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
}
.gt-foot { flex: none; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-1); }
</style>

