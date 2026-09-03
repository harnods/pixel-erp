<script setup lang="ts">
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink, MpBannerCloseButton } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Banner · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Banner" tag="MpBanner"
      lead="A prominent, persistent message inside the page (not a toast). Use for page-level state: info, success, danger, warning. is-inline for a slim single-line variant." />
    <DemoSection title="Variants"
      desc="info / success / danger / warning."
      code="<MpBanner id=&quot;x&quot; variant=&quot;info|success|danger|warning&quot;>
  <MpBannerIcon /><MpBannerTitle>…</MpBannerTitle>
  <MpBannerDescription>…</MpBannerDescription>
</MpBanner>">
      <div style="width:100%; display:flex; flex-direction:column; gap:12px">
        <MpBanner id="px-bn-i" variant="info"><MpBannerIcon /><MpBannerTitle>Notification</MpBannerTitle><MpBannerDescription>You're up to date.</MpBannerDescription></MpBanner>
        <MpBanner id="px-bn-s" variant="success"><MpBannerIcon /><MpBannerTitle>Saved</MpBannerTitle><MpBannerDescription>Your changes were saved.</MpBannerDescription></MpBanner>
        <MpBanner id="px-bn-d" variant="danger"><MpBannerIcon /><MpBannerTitle>Server error</MpBannerTitle><MpBannerDescription>A server error occurred.</MpBannerDescription></MpBanner>
        <MpBanner id="px-bn-w" variant="warning"><MpBannerIcon /><MpBannerTitle>Offline</MpBannerTitle><MpBannerDescription>Your progress may not be saved.</MpBannerDescription></MpBanner>
      </div>
    </DemoSection>
    <DemoSection title="Inline, link & close"
      desc="is-inline = slim; add MpBannerLink for actions and MpBannerCloseButton to dismiss."
      code="<MpBanner id=&quot;x&quot; variant=&quot;info&quot; is-inline>
  <MpBannerIcon /><MpBannerDescription>Report in progress.</MpBannerDescription>
  <MpBannerCloseButton />
</MpBanner>">
      <div style="width:100%"><MpBanner id="px-bn-il" variant="info" is-inline><MpBannerIcon /><MpBannerDescription>The report is in progress. Download by email.</MpBannerDescription><MpBannerCloseButton /></MpBanner></div>
    </DemoSection>
  </div>
</template>
