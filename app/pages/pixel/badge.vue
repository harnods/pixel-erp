<script setup lang="ts">
import { MpBadge } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Badge · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Badge" tag="MpBadge"
      lead="Highlight a status for quick recognition. ONE badge component for everything — MpBadge. `for` picks the context/shape (tableStatus in table rows · additionalInformation next to titles/tabs · indicator = dot); `type` picks the colour. Always the default size (no sm). ErpStatusBadge is deprecated — use MpBadge directly and map the status to a type per the table below."
      :rules="['rule/badge-single-mpbadge', 'rule/badge-for-context', 'rule/badge-size-default']" />

    <DemoSection title="For (context / shape) — #1"
      desc="tableStatus = the badge inside table rows & status columns — PASTEL/subtle (light bg + colored text). additionalInformation = beside a page-title H1 or tab — SOLID/bold fill + white text (warning keeps dark text), NOT pastel. indicator = a bare dot. Pick `for` by WHERE the badge sits."
      :rules="['rule/badge-for-context']"
      code="<MpBadge for=&quot;tableStatus&quot; type=&quot;information&quot;>Active</MpBadge>          <!-- in a table row -->
<MpBadge for=&quot;additionalInformation&quot; type=&quot;information&quot;>Active</MpBadge>  <!-- next to a title/tab -->
<MpBadge for=&quot;indicator&quot; type=&quot;information&quot; />                       <!-- dot only -->">
      <MpBadge for="tableStatus" type="information">tableStatus</MpBadge>
      <MpBadge for="additionalInformation" type="information">additionalInformation</MpBadge>
      <MpBadge for="indicator" type="information" />
    </DemoSection>

    <DemoSection title="Type (colour) + status mapping"
      desc="completed=green · warning=amber · critical=red · information=blue · announcement=gray (Pixel has NO purple). Map an entity status to a type consistently: paid/active/done → completed; pending/in-progress → warning; failed/voided/error → critical; new/requested → information; inactive/closed/draft → announcement."
      :rules="['rule/badge-status-mapping']"
      code="<MpBadge for=&quot;tableStatus&quot; type=&quot;completed&quot;>Paid</MpBadge>
<MpBadge for=&quot;tableStatus&quot; type=&quot;warning&quot;>Pending</MpBadge>
<MpBadge for=&quot;tableStatus&quot; type=&quot;critical&quot;>Voided</MpBadge>
<MpBadge for=&quot;tableStatus&quot; type=&quot;information&quot;>Requested</MpBadge>
<MpBadge for=&quot;tableStatus&quot; type=&quot;announcement&quot;>Inactive</MpBadge>">
      <MpBadge for="tableStatus" type="completed">Paid</MpBadge>
      <MpBadge for="tableStatus" type="warning">Pending</MpBadge>
      <MpBadge for="tableStatus" type="critical">Voided</MpBadge>
      <MpBadge for="tableStatus" type="information">Requested</MpBadge>
      <MpBadge for="tableStatus" type="announcement">Inactive</MpBadge>
    </DemoSection>

    <DemoSection title="Size — default only (#2)"
      desc="The ERP uses the DEFAULT badge size everywhere. Never set size=&quot;sm&quot;. The `for` value already gives the right footprint for its context."
      :rules="['rule/badge-size-default']"
      code="<MpBadge for=&quot;tableStatus&quot; type=&quot;information&quot;>Requested</MpBadge>   <!-- no size prop -->">
      <MpBadge for="tableStatus" type="information">Default</MpBadge>
      <MpBadge for="additionalInformation" type="completed">Default</MpBadge>
    </DemoSection>
  </div>
</template>
