<script setup lang="ts">
import { MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Tabs · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Tabs" tag="MpTabs">
    <MpTabs style="width:100%">
      <MpTabList>
        <MpTab>Overview</MpTab>
        <MpTab>Line items</MpTab>
      </MpTabList>
      <MpTabPanels>
        <MpTabPanel>Overview panel.</MpTabPanel>
        <MpTabPanel>Line items panel.</MpTabPanel>
      </MpTabPanels>
    </MpTabs>
  </DemoCard>
</template>
