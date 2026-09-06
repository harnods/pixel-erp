<script setup lang="ts">
import { MpBadge } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Badge · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Badge" tag="MpBadge"
      lead="Highlight a status for quick recognition. `for` picks the shape (tableStatus in rows, additionalInformation next to titles, indicator = dot); `type` picks the colour. For entity statuses prefer ErpStatusBadge."
      :rules="['rule/badge-status-mapping']" />
    <DemoSection title="Type (colour)"
      desc="completed=green, warning=amber, critical=red, information=blue, announcement=gray."
      code="<MpBadge for=&quot;tableStatus&quot; type=&quot;completed&quot;>Active</MpBadge>
<MpBadge for=&quot;tableStatus&quot; type=&quot;warning&quot;>Locked</MpBadge>
<MpBadge for=&quot;tableStatus&quot; type=&quot;critical&quot;>Voided</MpBadge>
<MpBadge for=&quot;tableStatus&quot; type=&quot;information&quot;>Requested</MpBadge>
<MpBadge for=&quot;tableStatus&quot; type=&quot;announcement&quot;>Inactive</MpBadge>">
      <MpBadge for="tableStatus" type="completed">Active</MpBadge>
      <MpBadge for="tableStatus" type="warning">Locked</MpBadge>
      <MpBadge for="tableStatus" type="critical">Voided</MpBadge>
      <MpBadge for="tableStatus" type="information">Requested</MpBadge>
      <MpBadge for="tableStatus" type="announcement">Inactive</MpBadge>
    </DemoSection>
    <DemoSection title="For (shape)"
      desc="tableStatus (rows), additionalInformation (beside titles/tabs), indicator (dot only)."
      code="<MpBadge for=&quot;tableStatus&quot; type=&quot;information&quot;>Active</MpBadge>
<MpBadge for=&quot;additionalInformation&quot; type=&quot;information&quot;>Active</MpBadge>
<MpBadge for=&quot;indicator&quot; type=&quot;information&quot; />">
      <MpBadge for="tableStatus" type="information">tableStatus</MpBadge>
      <MpBadge for="additionalInformation" type="information">additionalInformation</MpBadge>
      <MpBadge for="indicator" type="information" />
    </DemoSection>
    <DemoSection title="Size"
      desc="sm (table rows) and md (default)."
      code="<MpBadge size=&quot;sm&quot; type=&quot;information&quot;>Requested</MpBadge>
<MpBadge size=&quot;md&quot; type=&quot;information&quot;>Requested</MpBadge>">
      <MpBadge for="tableStatus" size="sm" type="information">Small</MpBadge>
      <MpBadge for="tableStatus" size="md" type="information">Medium</MpBadge>
    </DemoSection>
  </div>
</template>
