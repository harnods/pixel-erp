<template>
  <!--
    This is a demo layer for walkthroughs, not a product requirement; engineers
    building the product should ignore it. The only coupling to product screens
    is the data-tour="..." attributes they carry.
    Shares the one Guided tours switch with Asset settings.
  -->
  <div class="gts-card" data-tour="budget-tours-setting">
    <div class="gts-head">
      <span class="gts-title">Guided tour</span>
      <span class="gts-hint">Step-by-step demo walkthrough of budgets</span>
    </div>
    <div class="gts-row">
      <MpToggle
        id="st-budget-guided-tour"
        :is-checked="guidedToursOn"
        aria-label="Show guided tour"
        @update:is-checked="(v: boolean) => setGuidedTours(v)"
      />
      <div>
        <div class="gts-k">Show guided tour</div>
        <div class="gts-v">{{ guidedToursOn ? 'Guided tour is in the top bar' : 'Adds a Guided tour button to the top bar' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MpToggle } from '@mekari/pixel3'
import { guidedToursOn, setGuidedTours } from './tourSettings'
</script>

<style scoped>
.gts-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.gts-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.gts-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.gts-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.gts-row { display: flex; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.gts-k { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.gts-v { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
</style>
