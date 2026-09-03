<script setup lang="ts">
import { MpText, MpTimeline, MpTimelineItem, MpTimelineContent, MpTimelineTitle } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Timeline · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Timeline" tag="MpTimeline"
      lead="Show a chronological sequence of events (activity log, approval history). Note: MpTimelineBody / MpTimelineSeparator are NOT exported — use MpTimelineTitle + MpText inside MpTimelineContent." />
    <DemoSection title="Default"
      desc="Timeline > Item > Content > Title (+ any body text)."
      code="<MpTimeline>
  <MpTimelineItem>
    <MpTimelineContent>
      <MpTimelineTitle>Created</MpTimelineTitle>
      <MpText>23/06/2026, 15:30</MpText>
    </MpTimelineContent>
  </MpTimelineItem>
</MpTimeline>">
      <MpTimeline>
        <MpTimelineItem><MpTimelineContent><MpTimelineTitle>Created</MpTimelineTitle><MpText>23/06/2026, 15:30</MpText></MpTimelineContent></MpTimelineItem>
        <MpTimelineItem><MpTimelineContent><MpTimelineTitle>Approved</MpTimelineTitle><MpText>23/06/2026, 16:10</MpText></MpTimelineContent></MpTimelineItem>
      </MpTimeline>
    </DemoSection>
  </div>
</template>
