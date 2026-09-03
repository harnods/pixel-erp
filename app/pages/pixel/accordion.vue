<script setup lang="ts">
import { MpAccordion, MpAccordionItem, MpAccordionHeader, MpAccordionPanel } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Accordion · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Accordion" tag="MpAccordion">
    <MpAccordion is-allow-toggle style="width:100%">
      <MpAccordionItem id="px-acc-1">
        <MpAccordionHeader>Section one</MpAccordionHeader>
        <MpAccordionPanel>Panel content one.</MpAccordionPanel>
      </MpAccordionItem>
      <MpAccordionItem id="px-acc-2">
        <MpAccordionHeader>Section two</MpAccordionHeader>
        <MpAccordionPanel>Panel content two.</MpAccordionPanel>
      </MpAccordionItem>
    </MpAccordion>
  </DemoCard>
</template>
