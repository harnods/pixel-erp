<script setup lang="ts">
import { ref } from 'vue'
import { MpSlider } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Slider · Pixel 3 Enterprise' })
const a = ref(40)
</script>
<template>
  <div>
    <DemoHeader title="Slider" tag="MpSlider"
      lead="Pick a numeric value within a range by dragging. Use for coarse, approximate values (opacity, volume), not precise entry." />
    <DemoSection title="Default"
      desc="min / max define the range; v-model holds the value."
      code="<MpSlider id=&quot;x&quot; v-model=&quot;v&quot; :min=&quot;0&quot; :max=&quot;100&quot; />">
      <div style="width:100%"><MpSlider id="px-sl" v-model="a" :min="0" :max="100" /></div>
    </DemoSection>
  </div>
</template>
