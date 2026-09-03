<script setup lang="ts">
import { MpBadge } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Badge · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Badge" tag="MpBadge"
    snippet="<MpBadge for=&quot;tableStatus&quot; type=&quot;completed|warning|announcement|critical&quot; size=&quot;sm&quot;>Paid</MpBadge>">
    <MpBadge for="tableStatus" type="completed" size="sm">Completed</MpBadge>
    <MpBadge for="tableStatus" type="warning" size="sm">Pending</MpBadge>
    <MpBadge for="tableStatus" type="announcement" size="sm">Draft</MpBadge>
    <MpBadge for="tableStatus" type="critical" size="sm">Failed</MpBadge>
    <MpBadge for="tableStatus" type="information" size="sm">Info</MpBadge>
  </DemoCard>
</template>
