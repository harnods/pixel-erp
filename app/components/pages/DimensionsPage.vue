<!--
  Settings > Dimensions — entry point. Shows the first-run paywall until the
  tenant clicks "Start using Dimensions" / "Activate Dimensions", then swaps to
  the real management table. Registered in pageRegistry ([...slug].vue) so the
  swap happens without a route change; the page title bar's "+ New dimension"
  button (also in [...slug].vue) is gated on the same activation state.
-->
<script setup lang="ts">
import DimensionsPaywallPage from './DimensionsPaywallPage.vue'
import DimensionsIndexPage from './DimensionsIndexPage.vue'

const { dimensionsActivated, activateDimensions } = useDimensionsActivation()
</script>

<template>
  <DimensionsIndexPage v-if="dimensionsActivated" />
  <DimensionsPaywallPage v-else @activate="activateDimensions" />
</template>
