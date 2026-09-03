<script setup lang="ts">
import { MpSpinner, MpLoader } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Spinner / Loader · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Spinner / Loader" tag="MpSpinner / MpLoader"
      lead="MpSpinner is a small inline busy indicator; MpLoader is the branded full loader. For list/table loading prefer Skeleton over a spinner-over-blank." />
    <DemoSection title="Spinner sizes"
      desc="sm / md / lg."
      code="<MpSpinner size=&quot;sm&quot; />
<MpSpinner size=&quot;md&quot; />
<MpSpinner size=&quot;lg&quot; />">
      <MpSpinner size="sm" />
      <MpSpinner size="md" />
      <MpSpinner size="lg" />
    </DemoSection>
    <DemoSection title="Loader"
      desc="The branded loader for full-view loading."
      code="<MpLoader />">
      <MpLoader />
    </DemoSection>
  </div>
</template>
