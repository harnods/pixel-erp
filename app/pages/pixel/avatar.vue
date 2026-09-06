<script setup lang="ts">
import { MpAvatar, MpAvatarGroup } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Avatar · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Avatar" tag="MpAvatar"
      lead="Shows a profile image, initials, or fallback icon. Falls back to initials from `name` when `src` is missing." />
    <DemoSection title="Sizes"
      desc="sm / md / lg (default) / xl."
      code="<MpAvatar name=&quot;Dirman&quot; size=&quot;sm&quot; />
<MpAvatar name=&quot;Dirman&quot; size=&quot;md&quot; />
<MpAvatar name=&quot;Dirman&quot; size=&quot;lg&quot; />
<MpAvatar name=&quot;Dirman&quot; size=&quot;xl&quot; />">
      <MpAvatar name="Dirman" size="sm" variant-color="teal" />
      <MpAvatar name="Dirman" size="md" variant-color="teal" />
      <MpAvatar name="Dirman" size="lg" variant-color="teal" />
      <MpAvatar name="Dirman" size="xl" variant-color="teal" />
    </DemoSection>
    <DemoSection title="Variant & colour"
      desc="variant circle (default) / square; variant-color gray, sky, teal, violet, amber, rose, stone, lime, pink."
      code="<MpAvatar name=&quot;A&quot; variant=&quot;circle&quot; variant-color=&quot;violet&quot; />
<MpAvatar name=&quot;B&quot; variant=&quot;square&quot; variant-color=&quot;amber&quot; />">
      <MpAvatar name="Sky" variant-color="sky" />
      <MpAvatar name="Violet" variant-color="violet" />
      <MpAvatar name="Amber" variant-color="amber" />
      <MpAvatar name="Sq" variant="square" variant-color="rose" />
    </DemoSection>
    <DemoSection title="Group"
      desc="MpAvatarGroup with max collapses the rest into +N."
      code="<MpAvatarGroup :max=&quot;3&quot;>
  <MpAvatar name=&quot;A&quot; /><MpAvatar name=&quot;B&quot; /><MpAvatar name=&quot;C&quot; /><MpAvatar name=&quot;D&quot; />
</MpAvatarGroup>">
      <MpAvatarGroup :max="3">
        <MpAvatar name="Ana" variant-color="teal" />
        <MpAvatar name="Budi" variant-color="sky" />
        <MpAvatar name="Cici" variant-color="violet" />
        <MpAvatar name="Dedi" variant-color="amber" />
      </MpAvatarGroup>
    </DemoSection>
  </div>
</template>
