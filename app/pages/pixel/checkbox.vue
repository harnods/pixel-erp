<script setup lang="ts">
import { ref } from 'vue'
import { MpCheckbox } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Checkbox · Pixel 3 Enterprise' })
const a = ref(true)
const b = ref(false)
</script>
<template>
  <DemoCard title="Checkbox" tag="MpCheckbox"
    snippet="<MpCheckbox id=&quot;x&quot; v-model:is-checked=&quot;v&quot;>Label</MpCheckbox>">
    <MpCheckbox id="px-chk1" v-model:is-checked="a">Price includes tax</MpCheckbox>
    <MpCheckbox id="px-chk2" v-model:is-checked="b" :is-indeterminate="true">Indeterminate</MpCheckbox>
  </DemoCard>
</template>
