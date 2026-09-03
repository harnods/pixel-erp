<script setup lang="ts">
import { ref } from 'vue'
import { MpRating } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Rating · Pixel 3 Enterprise' })
const v = ref(3)
</script>
<template>
  <DemoCard title="Rating" tag="MpRating">
    <MpRating id="px-rate" v-model="v" />
  </DemoCard>
</template>
