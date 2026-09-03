<script setup lang="ts">
import { ref } from 'vue'
import { MpSlider } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Slider · Pixel 3 Enterprise' })
const v = ref(40)
</script>
<template>
  <DemoCard title="Slider" tag="MpSlider">
    <MpSlider id="px-sl" v-model="v" :min="0" :max="100" />
  </DemoCard>
</template>
