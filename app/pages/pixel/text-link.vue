<script setup lang="ts">
import { MpText, MpTextlink } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Text & link · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Text & link" tag="MpText / MpTextlink">
    <MpText>Body text at 14px.</MpText>
    <MpTextlink href="#">A text link</MpTextlink>
  </DemoCard>
</template>
