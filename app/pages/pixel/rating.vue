<script setup lang="ts">
import { ref } from 'vue'
import { MpRating } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Rating · Pixel 3 Enterprise' })
const a = ref(3)
</script>
<template>
  <div>
    <DemoHeader title="Rating" tag="MpRating"
      lead="Capture or display a star rating. Bind the value with v-model." />
    <DemoSection title="Default"
      desc="Interactive 5-star rating."
      code="<MpRating id=&quot;x&quot; v-model=&quot;v&quot; />">
      <MpRating id="px-rate" v-model="a" />
    </DemoSection>
  </div>
</template>
