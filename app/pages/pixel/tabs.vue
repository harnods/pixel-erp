<script setup lang="ts">
import { MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Tabs · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Tabs" tag="MpTabs"
      lead="Group related content on one page. In-page detail tabs use MpTabs; top-level status/section tabs use pageTabs on the route (outside the stage)."
      :rules="['rule/erp-tabs-pattern']" />
    <DemoSection title="Default"
      desc="Tabs > TabList > Tab(s) and TabPanels > TabPanel (same order). default-value sets the initial index."
      code="<MpTabs>
  <MpTabList><MpTab>Overview</MpTab><MpTab>Line items</MpTab></MpTabList>
  <MpTabPanels><MpTabPanel>…</MpTabPanel><MpTabPanel>…</MpTabPanel></MpTabPanels>
</MpTabs>">
      <MpTabs style="width:100%">
        <MpTabList><MpTab>Overview</MpTab><MpTab>Line items</MpTab></MpTabList>
        <MpTabPanels><MpTabPanel>Overview panel.</MpTabPanel><MpTabPanel>Line items panel.</MpTabPanel></MpTabPanels>
      </MpTabs>
    </DemoSection>
    <DemoSection title="Colour"
      desc="variant-color: blue (default), green, orange, red, gray."
      code="<MpTabs variant-color=&quot;green&quot;>…</MpTabs>">
      <MpTabs variant-color="green" style="width:100%">
        <MpTabList><MpTab>One</MpTab><MpTab>Two</MpTab></MpTabList>
        <MpTabPanels><MpTabPanel>Green one.</MpTabPanel><MpTabPanel>Green two.</MpTabPanel></MpTabPanels>
      </MpTabs>
    </DemoSection>
  </div>
</template>
