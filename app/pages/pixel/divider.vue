<script setup lang="ts">
import { MpText, MpDivider } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Divider · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Divider" tag="MpDivider">
    <div style="width:100%">
      <MpText>Above</MpText>
      <MpDivider />
      <MpText>Below</MpText>
    </div>
  </DemoCard>
</template>
