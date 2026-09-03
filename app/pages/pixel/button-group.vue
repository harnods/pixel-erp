<script setup lang="ts">
import { MpButton, MpButtonGroup } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Button group · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Button group" tag="MpButtonGroup">
    <MpButtonGroup>
      <MpButton variant="secondary" is-rounded>Day</MpButton>
      <MpButton variant="secondary" is-rounded>Week</MpButton>
      <MpButton variant="secondary" is-rounded>Month</MpButton>
    </MpButtonGroup>
  </DemoCard>
</template>
