<script setup lang="ts">
import { ref } from 'vue'
import { MpInput, MpInputGroup, MpInputLeftAddon } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Input group · Pixel 3 Enterprise' })
const v = ref('')
</script>
<template>
  <DemoCard title="Input group + addon" tag="MpInputGroup / MpInputLeftAddon">
    <MpInputGroup>
      <MpInputLeftAddon>Rp</MpInputLeftAddon>
      <MpInput id="px-in-amt" v-model="v" is-full-width placeholder="0" />
    </MpInputGroup>
  </DemoCard>
</template>
