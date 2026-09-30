<template>
  <!--
    Guided tours: the on/off switch shown in Asset settings.
    This is a demo layer for walkthroughs, not a product requirement; engineers
    building the product should ignore it. The only coupling to product screens
    is the data-tour="..." attributes they carry.
  -->
  <div class="gts-card" data-tour="tours-setting">
    <div class="gts-head">
      <span class="gts-title">Guided tours</span>
      <span class="gts-hint">Prototype walkthroughs, not part of the product</span>
    </div>
    <div class="gts-row">
      <MpToggle
        id="st-guided-tours"
        :is-checked="guidedToursOn"
        aria-label="Show guided tours"
        @update:is-checked="(v: boolean) => setGuidedTours(v)"
      />
      <div>
        <div class="gts-k">Show guided tours</div>
        <div class="gts-v">
          {{ guidedToursOn
            ? `On. A Guided tours menu in the top bar lists the ${ASSET_TOURS.length} walkthroughs. This switch is the only setting kept after a reload.`
            : 'Off. The asset screens are free to explore. Turn this on for a Guided tours menu in the top bar. This switch is the only setting kept after a reload.' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MpToggle } from '@mekari/pixel3'
import { ASSET_TOURS } from './assetTours'
import { guidedToursOn, setGuidedTours } from './tourSettings'
</script>

<style scoped>
.gts-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
.gts-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.gts-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.gts-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.gts-row { display: flex; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.gts-k { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.gts-v { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
</style>
