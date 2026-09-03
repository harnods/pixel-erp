<script setup lang="ts">
import { MpProgress } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Progress · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Progress" tag="MpProgress"
    snippet="<MpProgress :value=&quot;String(percent)&quot; size=&quot;sm&quot; color=&quot;positive&quot; />">
    <div style="width:100%"><MpProgress :value="'70'" size="sm" color="positive" /></div>
  </DemoCard>
</template>
