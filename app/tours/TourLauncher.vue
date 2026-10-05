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

