<script setup lang="ts">
import { MpText, MpTimeline, MpTimelineItem, MpTimelineContent, MpTimelineTitle } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Timeline · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Timeline" tag="MpTimeline">
    <MpTimeline>
      <MpTimelineItem>
        <MpTimelineContent>
          <MpTimelineTitle>Created</MpTimelineTitle>
          <MpText>23/06/2026, 15:30</MpText>
        </MpTimelineContent>
      </MpTimelineItem>
      <MpTimelineItem>
        <MpTimelineContent>
          <MpTimelineTitle>Approved</MpTimelineTitle>
          <MpText>23/06/2026, 16:10</MpText>
        </MpTimelineContent>
      </MpTimelineItem>
    </MpTimeline>
  </DemoCard>
</template>
