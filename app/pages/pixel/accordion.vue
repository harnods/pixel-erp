<script setup lang="ts">
import { MpAccordion, MpAccordionItem, MpAccordionHeader, MpAccordionIcon, MpAccordionPanel, MpText, css } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Accordion · Pixel 3 Enterprise' })
const headerText = css({ flex: '1', textAlign: 'left', fontWeight: 'semiBold' })
</script>
<template>
  <div>
    <DemoHeader title="Accordion" tag="MpAccordion"
      lead="Expand/collapse sections of content. The chevron is MpAccordionIcon — place it FIRST in the header with icon-position=&quot;start&quot; so it sits in front of the label. is-allow-toggle lets a panel close; is-allow-multiple lets several stay open."
      :rules="['rule/accordion-row-click']" />

    <DemoSection title="Chevron in front (icon-position start)"
      desc="Put <MpAccordionIcon /> as the first child of the header and set icon-position=&quot;start&quot; on the item. The whole header is the toggle."
      :rules="['rule/accordion-row-click']"
      code="<MpAccordion is-allow-toggle>
  <MpAccordionItem id=&quot;a&quot; icon-position=&quot;start&quot;>
    <MpAccordionHeader>
      <MpAccordionIcon />
      <MpText :class=&quot;headerText&quot;>Section one</MpText>
    </MpAccordionHeader>
    <MpAccordionPanel>Panel content.</MpAccordionPanel>
  </MpAccordionItem>
</MpAccordion>">
      <MpAccordion is-allow-toggle style="width:100%">
        <MpAccordionItem id="px-acc-1" icon-position="start">
          <MpAccordionHeader>
            <MpAccordionIcon />
            <MpText :class="headerText">Section one</MpText>
          </MpAccordionHeader>
          <MpAccordionPanel>Panel content one.</MpAccordionPanel>
        </MpAccordionItem>
        <MpAccordionItem id="px-acc-2" icon-position="start">
          <MpAccordionHeader>
            <MpAccordionIcon />
            <MpText :class="headerText">Section two</MpText>
          </MpAccordionHeader>
          <MpAccordionPanel>Panel content two.</MpAccordionPanel>
        </MpAccordionItem>
      </MpAccordion>
    </DemoSection>
  </div>
</template>
