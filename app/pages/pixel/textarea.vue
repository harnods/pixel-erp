<script setup lang="ts">
import { ref } from 'vue'
import { MpTextarea } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Textarea · Pixel 3 Enterprise' })
const v = ref('')
</script>
<template>
  <DemoCard title="Textarea" tag="MpTextarea">
    <MpTextarea id="px-ta" v-model="v" is-full-width placeholder="Notes…" />
  </DemoCard>
</template>
