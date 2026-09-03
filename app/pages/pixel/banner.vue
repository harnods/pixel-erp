<script setup lang="ts">
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Banner · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Banner" tag="MpBanner"
    snippet="<MpBanner id=&quot;x&quot; variant=&quot;info|warning|danger&quot;>
  <MpBannerIcon /><MpBannerTitle>…</MpBannerTitle>
  <MpBannerDescription>…</MpBannerDescription>
</MpBanner>">
    <MpBanner id="px-banner" variant="info" style="width:100%">
      <MpBannerIcon />
      <MpBannerTitle>Heads up</MpBannerTitle>
      <MpBannerDescription>This is an informational banner.</MpBannerDescription>
      <MpBannerLink href="#">Learn more</MpBannerLink>
    </MpBanner>
  </DemoCard>
</template>
