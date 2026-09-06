<script setup lang="ts">
import { MpProgress } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Progress · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Progress" tag="MpProgress"
      lead="A determinate progress bar. value is a string percentage; color sets the fill intent." />
    <DemoSection title="Colours"
      desc="positive (green) and information (blue) at different values."
      code="<MpProgress :value=&quot;String(percent)&quot; size=&quot;sm&quot; color=&quot;positive&quot; />
<MpProgress :value=&quot;'40'&quot; size=&quot;sm&quot; color=&quot;information&quot; />">
      <div style="width:100%"><MpProgress :value="'70'" size="sm" color="positive" /></div>
      <div style="width:100%"><MpProgress :value="'40'" size="sm" color="information" /></div>
    </DemoSection>
  </div>
</template>
