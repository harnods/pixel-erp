<script setup lang="ts">
import { ref } from 'vue'
import { MpToggle } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Toggle · Pixel 3 Enterprise' })
const v = ref(true)
</script>
<template>
  <DemoCard title="Toggle" tag="MpToggle">
    <MpToggle id="px-tog" v-model:is-checked="v" />
  </DemoCard>
</template>
