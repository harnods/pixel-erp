<script setup lang="ts">
import PmTitleBar from '../PmTitleBar.vue'
defineProps<{ projectId?: string }>()
</script>

<template>
  <div class="pm-page">
    <PmTitleBar title="SiteChangeCapturePage" />
    <div class="pm-stage"><div class="pm-empty">Coming soon</div></div>
  </div>
</template>
