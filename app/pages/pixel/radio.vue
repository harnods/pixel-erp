<script setup lang="ts">
import { ref } from 'vue'
import { MpRadio } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Radio · Pixel 3 Enterprise' })
const v = ref('a')
</script>
<template>
  <DemoCard title="Radio" tag="MpRadio"
    snippet="<MpRadio id=&quot;a&quot; name=&quot;g&quot; value=&quot;a&quot; v-model=&quot;v&quot;>A</MpRadio>">
    <MpRadio id="px-ra" name="px-r" value="a" v-model="v">Option A</MpRadio>
    <MpRadio id="px-rb" name="px-r" value="b" v-model="v">Option B</MpRadio>
  </DemoCard>
</template>
