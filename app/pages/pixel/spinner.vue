<script setup lang="ts">
import { MpSpinner, MpLoader } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Spinner / Loader · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Spinner / Loader" tag="MpSpinner / MpLoader">
    <MpSpinner size="sm" />
    <MpSpinner size="md" />
    <MpLoader />
  </DemoCard>
</template>
