<script setup lang="ts">
import { ref } from 'vue'
import { MpInput } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Input · Pixel 3 Enterprise' })
const v = ref('')
</script>
<template>
  <DemoCard title="Input" tag="MpInput"
    snippet="<MpInput id=&quot;x&quot; v-model=&quot;v&quot; is-full-width placeholder=&quot;…&quot; />">
    <MpInput id="px-in" v-model="v" is-full-width placeholder="Type here" />
  </DemoCard>
</template>
