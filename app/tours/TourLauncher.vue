<template>
  <!--
    Guided tours: the launcher in the top bar, beside View as.
    This is a demo layer for walkthroughs, not a product requirement; engineers
    building the product should ignore it. The only coupling to product screens
    is the data-tour="..." attributes they carry.
    Shown only when Asset settings > Guided tours is on.
  -->
  <MpPopover
    v-if="guidedToursOn"
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
      <div class="gtl-heading">Walkthroughs of the fixed asset module. Starting one resets the session sample data.</div>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="t in ASSET_TOURS"
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
    </MpPopoverContent>
  </MpPopover>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import { ASSET_TOURS, type AssetTour } from './assetTours'
import { guidedToursOn } from './tourSettings'
import { activeTour, startTour, stopTour } from './tourRunner'

const router = useRouter()

function start(t: AssetTour, closePopover: () => void) {
  closePopover()
  startTour(t, router)
}

// Turning guided mode off ends a running tour.
watch(guidedToursOn, (on) => { if (!on) stopTour() })
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
  min-width: 320px;
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
 * screen stays usable (each step asks for an action on it). The panel sits
 * above drawers (1300) and below popovers (1600), so a dropdown a step asks
 * for opens over it rather than under it.
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
  width: var(--mp-sizes-sm, 24rem);
  max-width: calc(100vw - var(--mp-spacing-8, 32px));
  max-height: calc(100vh - var(--mp-spacing-20, 80px));
  overflow-y: auto;
  padding: var(--mp-spacing-4);
  background: var(--mp-colors-background-surface, #fff);
  border: 1px solid var(--mp-colors-border-default, #d0d6dd);
  border-radius: var(--mp-radii-lg, 8px);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
}
.gt-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.gt-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.gt-title { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.gt-body { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-colors-text-default); }
.gt-block { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-top: var(--mp-spacing-2); border-top: 1px solid var(--mp-colors-border-default, #d0d6dd); }
.gt-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); }
.gt-text { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-colors-text-default); }
.gt-foot { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-2); }
</style>

