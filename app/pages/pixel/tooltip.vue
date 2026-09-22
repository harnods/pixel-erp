<script setup lang="ts">
import { MpButton, MpTooltip } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Tooltip · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Tooltip" tag="MpTooltip"
      lead="A short hint shown on hover/focus. Use for icon buttons and truncated text — never for essential information." />
    <DemoSection title="Default"
      desc="Wrap the trigger; set the hint via label."
      code="<MpTooltip label=&quot;Helpful hint&quot;>
  <MpButton variant=&quot;secondary&quot; is-rounded>Hover me</MpButton>
</MpTooltip>">
      <MpTooltip label="Helpful hint"><MpButton variant="secondary" is-rounded>Hover me</MpButton></MpTooltip>
    </DemoSection>
  </div>
</template>
