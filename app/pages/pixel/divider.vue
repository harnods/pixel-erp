<script setup lang="ts">
import { MpText, MpDivider } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Divider · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Divider" tag="MpDivider"
      lead="A thin rule to separate content or groups within a surface." />
    <DemoSection title="Horizontal"
      desc="Separates stacked blocks."
      code="<MpText>Above</MpText>
<MpDivider />
<MpText>Below</MpText>">
      <div style="width:100%">
        <MpText>Above</MpText>
        <MpDivider />
        <MpText>Below</MpText>
      </div>
    </DemoSection>
  </div>
</template>
