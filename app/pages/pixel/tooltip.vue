<script setup lang="ts">
import { MpButton, MpTooltip } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Tooltip · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Tooltip" tag="MpTooltip">
    <MpTooltip label="Helpful hint">
      <MpButton variant="secondary" is-rounded>Hover me</MpButton>
    </MpTooltip>
  </DemoCard>
</template>
