<script setup lang="ts">
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Popover · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Popover" tag="MpPopover"
      lead="A floating panel anchored to a trigger — row action menus, column sort menus, ErpFilterSelect are built on this." />
    <DemoSection title="Action menu"
      desc="Trigger > Content > List > ListItem."
      code="<MpPopover>
  <MpPopoverTrigger><MpButton variant=&quot;secondary&quot; is-rounded>Actions</MpButton></MpPopoverTrigger>
  <MpPopoverContent><MpPopoverList>
    <MpPopoverListItem>Edit</MpPopoverListItem>
    <MpPopoverListItem>Duplicate</MpPopoverListItem>
  </MpPopoverList></MpPopoverContent>
</MpPopover>">
      <MpPopover>
        <MpPopoverTrigger><MpButton variant="secondary" is-rounded>Actions</MpButton></MpPopoverTrigger>
        <MpPopoverContent><MpPopoverList><MpPopoverListItem>Edit</MpPopoverListItem><MpPopoverListItem>Duplicate</MpPopoverListItem></MpPopoverList></MpPopoverContent>
      </MpPopover>
    </DemoSection>
  </div>
</template>
