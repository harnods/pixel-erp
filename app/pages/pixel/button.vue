<script setup lang="ts">
import { MpButton } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Button · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Button — variants" tag="MpButton"
    :rules="['rule/btn-always-pill', 'rule/btn-one-primary']"
    snippet="<MpButton variant=&quot;primary&quot; is-rounded>Save</MpButton>
<MpButton variant=&quot;secondary&quot; is-rounded>Import</MpButton>
<MpButton variant=&quot;ghost&quot; is-rounded>Cancel</MpButton>
<MpButton variant=&quot;danger&quot; is-rounded>Delete</MpButton>">
    <MpButton variant="primary" is-rounded>Primary</MpButton>
    <MpButton variant="secondary" is-rounded>Secondary</MpButton>
    <MpButton variant="ghost" is-rounded>Ghost</MpButton>
    <MpButton variant="danger" is-rounded>Danger</MpButton>
  </DemoCard>
</template>
