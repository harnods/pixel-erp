<script setup lang="ts">
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Status badge · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Status badge" tag="ErpStatusBadge" override="Use this for entity statuses, not a raw MpBadge."
      lead="Maps a status string (paid, pending, approved…) to the correct MpBadge type + label, so the same status is always the same colour across modules."
      :rules="['rule/badge-status-mapping']" />
    <DemoSection title="By status"
      desc="Pass status=&quot;…&quot;; the component picks colour + label. Override with type/label props only when a module needs different wording/colour."
      :rules="['rule/badge-status-mapping']"
      code="<ErpStatusBadge status=&quot;paid&quot; />
<ErpStatusBadge status=&quot;pending&quot; />
<ErpStatusBadge status=&quot;approved&quot; />
<ErpStatusBadge status=&quot;draft&quot; />">
      <ErpStatusBadge status="paid" />
      <ErpStatusBadge status="pending" />
      <ErpStatusBadge status="approved" />
      <ErpStatusBadge status="draft" />
    </DemoSection>
  </div>
</template>
