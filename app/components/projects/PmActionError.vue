<script setup lang="ts">
/** Inline refusal / error next to the action that caused it (rule/form-errors-inline). */
import { MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'

defineProps<{ error?: string; id?: string }>()
</script>

<template>
  <MpBanner v-if="error" :id="id ?? 'pm-action-error'" variant="danger" role="alert">
    <MpBannerIcon />
    <MpBannerDescription>{{ error }}</MpBannerDescription>
  </MpBanner>
</template>
