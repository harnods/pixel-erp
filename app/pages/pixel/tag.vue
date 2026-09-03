<script setup lang="ts">
import { MpTag } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Tag · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Tag" tag="MpTag">
    <MpTag>Category</MpTag>
    <MpTag>Warehouse A</MpTag>
  </DemoCard>
</template>
