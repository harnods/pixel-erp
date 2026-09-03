<script setup lang="ts">
import { MpSkeleton } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Skeleton · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Skeleton" tag="MpSkeleton">
    <div style="width:100%">
      <MpSkeleton width="60%" height="14px" rounded="sm" />
      <MpSkeleton width="90%" height="14px" rounded="sm" />
    </div>
  </DemoCard>
</template>
