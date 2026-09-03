<script setup lang="ts">
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Popover · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Popover" tag="MpPopover">
    <MpPopover>
      <MpPopoverTrigger>
        <MpButton variant="secondary" is-rounded>Actions</MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent>
        <MpPopoverList>
          <MpPopoverListItem>Edit</MpPopoverListItem>
          <MpPopoverListItem>Duplicate</MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>
  </DemoCard>
</template>
