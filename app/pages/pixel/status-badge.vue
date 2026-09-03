<script setup lang="ts">
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Status badge · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Status badge" tag="ErpStatusBadge"
    override="Maps a status string → the correct Pixel badge type + label. Use this, not a raw MpBadge, for statuses."
    :rules="['rule/badge-status-mapping']"
    snippet="<ErpStatusBadge status=&quot;paid&quot; />">
    <ErpStatusBadge status="paid" />
    <ErpStatusBadge status="pending" />
    <ErpStatusBadge status="approved" />
  </DemoCard>
</template>
