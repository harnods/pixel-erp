<template>
  <!-- Access gate: nothing renders until a valid @mekari.com session resolves. -->
  <AuthGate>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </AuthGate>
  <!--
    Design-review overlay — mount ONLY when Review mode is on. Mounting it
    unconditionally ran its Supabase annotation fetch (useAnnotations →
    watch(routeKey, …, { immediate: true })) on EVERY page load. When that
    proto-review Supabase backend is unavailable the request hangs, the page
    never settles, and the app shows blank until a reload wins the race.
    Gating the mount keeps normal usage completely free of proto-review
    network calls; the overlay (and its fetch) only exist in Review mode.
  -->
  <ProtoReviewOverlay v-if="isReviewMode" />
</template>

<script setup lang="ts">
// Theme is applied synchronously in pixel.client.ts before mount.
import { onMounted, watch } from 'vue'
import { useReviewMode } from '@ds/proto-review'

// Review-mode init used to live in the overlay's own onMounted — but the overlay
// no longer mounts until Review mode is already on, so resolve it here from the
// ?review query / sessionStorage, without mounting the overlay (and without any
// Supabase traffic). Turning Review mode on via the user menu mounts the overlay.
const route = useRoute()
const { isReviewMode, initFromQuery } = useReviewMode()
onMounted(() => initFromQuery())
watch(() => route.query, () => initFromQuery())
</script>
