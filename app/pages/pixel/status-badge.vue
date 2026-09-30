<script setup lang="ts">
import { MpBadge } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Status badge (deprecated) · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Status badge" tag="ErpStatusBadge" :deprecated="true"
      override="Deprecated — there is ONE badge: MpBadge. Use MpBadge directly (see Badge) and map the status to a type."
      lead="ErpStatusBadge is deprecated. Don't add new usages. Everything is MpBadge with for=&quot;tableStatus&quot; + the mapped type. See the Badge page for the status→type mapping."
      :rules="['rule/badge-single-mpbadge', 'rule/badge-status-mapping']" />

    <DemoSection title="Migrate to MpBadge"
      desc="Replace ErpStatusBadge with MpBadge and the mapped type/label."
      :rules="['rule/badge-single-mpbadge']"
      code="<!-- before -->
<ErpStatusBadge status=&quot;paid&quot; />
<!-- after -->
<MpBadge for=&quot;tableStatus&quot; type=&quot;completed&quot;>Paid</MpBadge>">
      <MpBadge for="tableStatus" type="completed">Paid</MpBadge>
      <MpBadge for="tableStatus" type="warning">Pending</MpBadge>
      <MpBadge for="tableStatus" type="information">Approved</MpBadge>
      <MpBadge for="tableStatus" type="announcement">Draft</MpBadge>
    </DemoSection>
  </div>
</template>
