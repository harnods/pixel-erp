<script setup lang="ts">
import { ref } from 'vue'
import { MpSegmentedControl } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Segmented control · Pixel 3 Enterprise' })
const v = ref('list')
const data = [{ label: 'List', value: 'list' }, { label: 'Board', value: 'board' }]
</script>
<template>
  <DemoCard title="Segmented control" tag="MpSegmentedControl">
    <MpSegmentedControl id="px-seg" name="px-seg" v-model="v" :data="data" />
  </DemoCard>
</template>
