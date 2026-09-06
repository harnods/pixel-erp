<script setup lang="ts">
import { MpAccordion, MpAccordionItem, MpAccordionHeader, MpAccordionPanel } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Accordion · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Accordion" tag="MpAccordion"
      lead="Expand/collapse sections of content. is-allow-toggle lets a panel close; is-allow-multiple lets several stay open."
      :rules="['rule/accordion-row-click']" />
    <DemoSection title="Toggle (single)"
      desc="Click a header to expand; clicking again collapses."
      :rules="['rule/accordion-row-click']"
      code="<MpAccordion is-allow-toggle>
  <MpAccordionItem id=&quot;a&quot;>
    <MpAccordionHeader>Section one</MpAccordionHeader>
    <MpAccordionPanel>Panel content.</MpAccordionPanel>
  </MpAccordionItem>
</MpAccordion>">
      <MpAccordion is-allow-toggle style="width:100%">
        <MpAccordionItem id="px-acc-1"><MpAccordionHeader>Section one</MpAccordionHeader><MpAccordionPanel>Panel content one.</MpAccordionPanel></MpAccordionItem>
        <MpAccordionItem id="px-acc-2"><MpAccordionHeader>Section two</MpAccordionHeader><MpAccordionPanel>Panel content two.</MpAccordionPanel></MpAccordionItem>
      </MpAccordion>
    </DemoSection>
  </div>
</template>
