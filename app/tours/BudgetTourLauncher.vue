<template>
  <!--
    Guided tour launcher for the budget screens, beside View as.
    This is a demo layer for walkthroughs, not a product requirement; engineers
    building the product should ignore it. The only coupling to product screens
    is the data-tour="..." attributes they carry.
    Always shown on the budget and purchase screens; one press starts BUD-1.
  -->
  <MpButton
    class="btl-trigger"
    variant="ghost"
    is-rounded
    data-tour="budget-tour-launcher"
    @click="start"
  >
    Play guided tour
  </MpButton>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { MpButton } from '@mekari/pixel3'
import { BUDGET_TOUR } from './budgetTours'
import { startTour, stopTour, activeTour } from './tourRunner'

const router = useRouter()
function start() {
  if (activeTour.value) stopTour()
  startTour(BUDGET_TOUR, router)
}
</script>

<style scoped>
.btl-trigger { color: var(--mp-colors-text-inverse, #fff); }
.btl-trigger:hover { background: var(--mp-colors-background-header-menu-hovered, rgba(255, 255, 255, 0.08)); }
</style>
